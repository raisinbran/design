"""Archive collections foundation. Reads/renders only; no editor or save entrypoint.

The UTF-8 source template is retained verbatim, including CRLF/BOM. Unchanged
records return original bytes; edits replace only the bounded collection region.
"""
import copy
import hashlib
import json
import math
import re
from pathlib import Path
from urllib.parse import unquote
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[2]
PRIORITIES={"low","normal","portraitBoost","featured"}
FIELDS=("id","title","heading","context","cover","coverPosition","coverSize",
        "headerMinHeight","expanded","media")


def local_asset(root,name):
    if not isinstance(name,str) or not name or any(c in name for c in '\\:\x00?#'):
        raise ValueError("Expected a repository-relative Archive asset")
    decoded=unquote(name)
    path=Path(decoded)
    if path.is_absolute() or any(c in decoded for c in '\\:\x00?#') or '..' in path.parts:
        raise ValueError("Unsafe Archive asset path")
    target=(Path(root)/path).resolve()
    if not target.is_relative_to(Path(root).resolve()):raise ValueError("Archive asset leaves repository")
    return target


def style_value(style,key,default=""):
    match=re.search(r'(?:^|;)\s*'+re.escape(key)+r'\s*:\s*([^;]+)',style)
    return match.group(1).strip() if match else default


def settings_values(source):
    match=re.search(r'window\.ARCHIVE_PHOTO_PROMINENCE\s*=\s*Object\.freeze\((\{.*?\})\)\s*;',source,re.S)
    if not match:raise ValueError("Expected literal Archive prominence settings")
    try:values=json.loads(match.group(1))
    except json.JSONDecodeError as exc:raise ValueError("Archive settings must be literal JSON") from exc
    if not isinstance(values,dict):raise ValueError("Invalid Archive prominence settings")
    return values


def sections(source):
    main=re.search(r'<main\b[^>]*\bid=[\"\']archive-main[\"\'][^>]*>(.*?)</main>',source,re.S|re.I)
    if not main:raise ValueError("Archive main boundary missing")
    matches=list(re.finditer(r'<details\b.*?</details>',main.group(1),re.S|re.I))
    if not matches:raise ValueError("Archive collection boundaries missing")
    soup=BeautifulSoup(main.group(0),'html.parser')
    mount=soup.select_one('#pilot-projects')
    if mount is None or len(mount.select(':scope > details.project'))!=len(matches):
        raise ValueError("Unsupported Archive nesting or collection boundary")
    return [(main.start(1)+m.start(),main.start(1)+m.end(),m.group()) for m in matches]


def parse_collections(source,overrides):
    collections=[]
    for _,_,raw in sections(source):
        soup=BeautifulSoup(raw,'html.parser');section=soup.find('details')
        title=section.select_one('.project-header-text');body=section.select_one('.project-body')
        header=section.select_one('summary.project-header');cover=section.select_one('.project-header-bg')
        if any(e is None for e in (title,body,header,cover)):raise ValueError("Incomplete Archive collection")
        bg=cover.get('style','');url=re.search(r'url\([\"\']?(.*?)[\"\']?\)',bg)
        gallery=body.select_one('.project-gallery')
        if url is None or gallery is None:raise ValueError("Missing Archive cover/gallery")
        heading=body.find('h2',recursive=False);context=body.select_one('.lead')
        media=[]
        for i,fig in enumerate(gallery.select(':scope > figure')):
            image=fig.find('img');caption=fig.select_one('.caption-main');credit=fig.find('small')
            if image is None:raise ValueError("Unsupported Archive media")
            src=image.get('src','')
            media.append({'id':f"{section.get('id')}-media-{i+1:02d}",'src':src,'alt':image.get('alt',''),
                'caption':caption.get_text() if caption else '', 'credit':credit.get_text() if credit else '',
                'cropMode':fig.get('data-crop-mode','natural'),
                'displayRatio':float(fig['data-display-ratio']) if fig.has_attr('data-display-ratio') else None,
                'position':style_value(fig.get('style',''),'--media-position','50% 50%'),
                'prominence':overrides.get(Path(unquote(src)).name.lower(),'normal'),
                'figureAttributes':dict(fig.attrs),'imageAttributes':{k:v for k,v in image.attrs.items() if k not in ('src','alt')}})
        collections.append({'id':section.get('id'),'title':title.get_text(),'heading':heading.get_text() if heading else '',
            'context':context.get_text() if context else '', 'cover':url.group(1),
            'coverPosition':style_value(bg,'background-position','50% 50%'),
            'coverSize':style_value(bg,'background-size','cover'),
            'headerMinHeight':style_value(header.get('style',''),'min-height','8em'),
            'expanded':section.has_attr('open'),'media':media})
    return collections


def migrate(page,settings):
    source=page.decode('utf-8') if isinstance(page,bytes) else page
    settings=settings.decode('utf-8') if isinstance(settings,bytes) else settings
    overrides=settings_values(settings)
    return {'schemaVersion':1,'sourceHtml':source,'sourceSha256':hashlib.sha256(source.encode('utf-8')).hexdigest(),
        'settingsSource':settings,'prominenceOverrides':overrides,'collections':parse_collections(source,overrides)}


def read_catalog(root=ROOT):
    path=Path(root)/'data/archive-catalog.json'
    return json.loads(path.read_text(encoding='utf-8'))


def percentages(value):
    if not isinstance(value,str) or not re.fullmatch(r'\d+(?:\.\d+)?% \d+(?:\.\d+)?%',value):return False
    return all(0<=float(v[:-1])<=100 for v in value.split())


def validate(catalog,root=ROOT):
    if not isinstance(catalog,dict) or catalog.get('schemaVersion')!=1 or not isinstance(catalog.get('collections'),list):
        raise ValueError("Invalid Archive catalog")
    source=catalog.get('sourceHtml');settings=catalog.get('settingsSource')
    if not isinstance(source,str) or hashlib.sha256(source.encode('utf-8')).hexdigest()!=catalog.get('sourceSha256'):
        raise ValueError("Archive template fingerprint mismatch")
    if not isinstance(settings,str):raise ValueError("Missing Archive settings source")
    overrides=catalog.get('prominenceOverrides')
    if overrides!=settings_values(settings):raise ValueError("Archive prominence settings mismatch")
    baseline=parse_collections(source,overrides)
    if len(catalog['collections'])!=len(baseline):raise ValueError("Collection boundaries cannot be added/removed in Phase 5A")
    ids=set();media_ids=set();sources=set()
    for collection in catalog['collections']:
        if not isinstance(collection,dict) or any(k not in collection for k in FIELDS):raise ValueError("Incomplete Archive collection")
        key=collection['id']
        if not isinstance(key,str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]*',key) or key in ids or key in media_ids:raise ValueError("Invalid/duplicate collection ID")
        ids.add(key)
        for field in ('title','heading','context'):
            if not isinstance(collection[field],str) or (field=='title' and not collection[field].strip()):raise ValueError("Invalid Archive text")
        if type(collection['expanded']) is not bool:raise ValueError("Invalid expanded state")
        if not percentages(collection['coverPosition']) or collection['coverSize'] not in ('cover','contain','auto'):
            raise ValueError("Invalid cover framing")
        if not isinstance(collection['headerMinHeight'],str) or not re.fullmatch(r'\d+(?:\.\d+)?(?:em|rem|px)',collection['headerMinHeight']):
            raise ValueError("Invalid cover height")
        if not local_asset(root,collection['cover']).is_file():raise ValueError("Missing Archive cover")
        if not isinstance(collection['media'],list) or not collection['media']:raise ValueError("Archive collection needs media")
        for media in collection['media']:
            if not isinstance(media,dict) or any(k not in media for k in ('id','src','alt','caption','credit','cropMode','displayRatio','position','prominence','figureAttributes','imageAttributes')):
                raise ValueError("Incomplete Archive media")
            key=media['id']
            if not isinstance(key,str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]*',key) or key in media_ids or key in ids:raise ValueError("Invalid/duplicate media ID")
            media_ids.add(key)
            for field in ('src','alt','caption','credit'):
                if not isinstance(media[field],str) or (field in ('src','alt') and not media[field].strip()):raise ValueError("Invalid Archive media text")
            if media['src'].casefold() in sources:raise ValueError("Duplicate Archive media reference")
            sources.add(media['src'].casefold())
            if not local_asset(root,media['src']).is_file():raise ValueError("Missing Archive media")
            ratio=media['displayRatio']
            if ratio is not None and (type(ratio) not in (int,float) or not math.isfinite(ratio) or not .25<=ratio<=7):raise ValueError("Invalid display ratio")
            if media['cropMode'] not in ('natural','square') or not isinstance(media['prominence'],str) or media['prominence'] not in PRIORITIES or not percentages(media['position']):raise ValueError("Invalid Archive framing/prominence")
            for field in ('figureAttributes','imageAttributes'):
                attrs=media[field]
                allowed={'class','style','data-display-ratio','data-crop-mode'} if field=='figureAttributes' else {'class','style','loading','decoding','width','height','title'}
                if not isinstance(attrs,dict) or any(k not in allowed or not isinstance(v,(str,list)) or (isinstance(v,list) and (k!='class' or not all(isinstance(s,str) for s in v))) for k,v in attrs.items()):raise ValueError("Invalid media attributes")
    if ids!={c['id'] for c in baseline}:raise ValueError("Unknown collection boundary")
    names={Path(unquote(m['src'])).name.lower() for c in catalog['collections'] for m in c['media']}
    if any(not isinstance(k,str) or k not in names or not isinstance(v,str) or v not in PRIORITIES for k,v in overrides.items()):raise ValueError("Invalid prominence reference")
    return sum(len(c['media']) for c in catalog['collections'])


def set_style(node,key,value):
    style=node.get('style','')
    pattern=r'(^|;)\s*'+re.escape(key)+r'\s*:[^;]*'
    if re.search(pattern,style):style=re.sub(pattern,lambda m:m.group(1)+key+':'+value,style)
    else:style=style.rstrip(';')+';'+key+':'+value
    node['style']=style.lstrip(';')


def render_collection(collection,original,raw):
    if collection==original:return raw
    soup=BeautifulSoup(raw,'html.parser');section=soup.find('details')
    section.select_one('.project-header-text').string=collection['title']
    body=section.select_one('.project-body');body.find('h2',recursive=False).string=collection['heading']
    lead=body.select_one('.lead')
    if lead is not None:lead.string=collection['context']
    elif collection['context']:
        lead=soup.new_tag('p',attrs={'class':'lead'});lead.string=collection['context'];body.find('h2').insert_after(lead)
    if collection['expanded']:section['open']=''
    else:section.attrs.pop('open',None)
    cover=section.select_one('.project-header-bg')
    set_style(cover,'background-image','url("'+collection['cover'].replace('"','%22')+'")')
    set_style(cover,'background-position',collection['coverPosition']);set_style(cover,'background-size',collection['coverSize'])
    set_style(section.find('summary'),'min-height',collection['headerMinHeight'])
    gallery=body.select_one('.project-gallery');figures=list(gallery.select(':scope > figure'))
    originals={m['id']:fig for m,fig in zip(original['media'],figures)}
    gallery.clear()
    for media in collection['media']:
        fig=copy.deepcopy(originals.get(media['id']))
        if fig is None:fig=soup.new_tag('figure');fig.append(soup.new_tag('img'))
        fig.attrs=copy.deepcopy(media['figureAttributes']);image=fig.find('img')
        image.attrs=copy.deepcopy(media['imageAttributes']);image['src']=media['src'];image['alt']=media['alt']
        if media['displayRatio'] is None:fig.attrs.pop('data-display-ratio',None)
        else:fig['data-display-ratio']=str(media['displayRatio'])
        if media['cropMode']=='natural':fig.attrs.pop('data-crop-mode',None)
        else:fig['data-crop-mode']=media['cropMode']
        set_style(fig,'--media-position',media['position'])
        # Prominence belongs to the settings script, not an HTML attribute.
        # Refuse such edits until Phase 5B supplies a paired settings writer.
        if media['prominence']!=next((m['prominence'] for m in original['media'] if m['id']==media['id']),'normal'):
            raise ValueError("Prominence editing requires the Phase 5B settings writer")
        old=fig.find('figcaption')
        if old is not None:old.decompose()
        if media['caption'] or media['credit']:
            caption=soup.new_tag('figcaption');fig.append(caption)
            for tag,cls,key in (('span','caption-main','caption'),('small',None,'credit')):
                if media[key]:
                    node=soup.new_tag(tag);node.string=media[key]
                    if cls:node['class']=cls
                    caption.append(node)
        gallery.append(fig)
    return str(section)


def render(catalog,root=ROOT,page=None):
    validate(catalog,root)
    source=catalog['sourceHtml'];encoded=source.encode('utf-8')
    if page is not None and page!=encoded:raise ValueError("Archive page changed; reload before rendering")
    baseline=parse_collections(source,catalog['prominenceOverrides']);bounds=sections(source)
    originals={c['id']:(c,raw) for c,(_,_,raw) in zip(baseline,bounds)}
    result=source;replacements=[]
    # Slots preserve all separators/chrome; catalog order determines section order.
    for collection,(start,end,_) in zip(catalog['collections'],bounds):
        original,raw=originals[collection['id']]
        replacements.append((start,end,render_collection(collection,original,raw)))
    for start,end,fragment in reversed(replacements):result=result[:start]+fragment+result[end:]
    return result.encode('utf-8')
