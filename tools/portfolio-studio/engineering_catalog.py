"""Engineering project catalog and lossless migration of existing case studies."""
import copy
import hashlib
import html
import json
import re
from pathlib import Path
from urllib.parse import unquote
from bs4 import BeautifulSoup
from gallery_thumbnails import asset_transaction
from platform_support import backup_root

ROOT=Path(__file__).resolve().parents[2]
FIELDS=("id","title","heading","context","bodyHtml","cover","coverPosition","media","visible","expanded")


def snapshot(project):
    return {key:copy.deepcopy(project.get(key)) for key in FIELDS}


def parse_media(figure):
    image=figure.find("img");video=figure.find("video");link=figure.find("a")
    kind="image" if image else "video" if video else "document"
    source=image or (video.find("source") or video if video else link)
    src=source.get("src",source.get("href","")) if source else ""
    caption=figure.select_one(".caption-main");credit=figure.find("small")
    return {"kind":kind,"src":src,"alt":image.get("alt","") if image else "",
            "caption":caption.get_text() if caption else "","credit":credit.get_text() if credit else "",
            "html":str(figure)}


def migrate(page):
    matches=list(re.finditer(r"<details\b.*?</details>",page,re.S|re.I))
    if not matches:raise ValueError("No Engineering project sections found")
    projects=[]
    for index,match in enumerate(matches):
        raw=match.group();soup=BeautifulSoup(raw,"html.parser");section=soup.find("details")
        title=section.select_one(".project-header-text");body=section.select_one(".project-body")
        if not title or not body:raise ValueError("Unexpected Engineering section structure")
        h=body.find("h2",recursive=False);context=body.select_one(".lead")
        prose=body.select_one(".project-prose");cover=section.select_one(".project-header-bg")
        background=cover.get("style","") if cover else ""
        source=re.search(r"url\(['\"]?(.*?)['\"]?\)",background)
        position=re.search(r"background-position\s*:\s*([^;]+)",background)
        project={"id":section.get("id"),"title":title.get_text(),"heading":h.get_text() if h else "",
            "context":context.get_text() if context else "","bodyHtml":prose.decode_contents() if prose else "",
            "cover":source.group(1) if source else "","coverPosition":position.group(1) if position else "50% 50%",
            "media":[parse_media(fig) for fig in section.select(".project-gallery > figure")],
            "visible":True,"expanded":section.has_attr("open"),"legacyHtml":raw,
            "separator":page[match.end():matches[index+1].start()] if index+1<len(matches) else ""}
        project["baseline"]=snapshot(project);projects.append(project)
    return {"schemaVersion":1,"projects":projects}


def read_catalog(root=ROOT):
    root=Path(root);path=root/"data"/"engineering-catalog.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else migrate((root/"engineeringdesign.html").read_text(encoding="utf-8"))


def new_project(identifier,title="New project"):
    return {"id":identifier,"title":title,"heading":"","context":"","bodyHtml":"",
            "cover":"","coverPosition":"50% 50%","media":[],"visible":False,"expanded":False,"separator":"\n"}


def local_asset(root,name):
    path=Path(unquote(name))
    if not name or path.is_absolute() or ":" in name or ".." in path.parts or "\\" in name:
        raise ValueError(f"Use a repository-relative asset path: {name}")
    target=(Path(root)/path).resolve()
    if not target.is_relative_to(Path(root).resolve()):raise ValueError("Asset leaves repository")
    return target


def validate(catalog,root=ROOT,pending=()):
    if catalog.get("schemaVersion")!=1 or not isinstance(catalog.get("projects"),list):raise ValueError("Invalid Engineering catalog")
    seen=set();pending={Path(p).resolve() for p in pending}
    for p in catalog["projects"]:
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]*",p["id"]) or p["id"] in seen:raise ValueError("Project IDs must be unique and start with a letter")
        seen.add(p["id"])
        if not p["title"].strip():raise ValueError("Every project needs a title")
        if not re.fullmatch(r"(?:100|\d{1,2})(?:\.\d+)?% (?:100|\d{1,2})(?:\.\d+)?%",p.get("coverPosition","50% 50%")):
            raise ValueError("Cover focus must be two percentages from 0 to 100")
        if any(float(value.rstrip("%"))>100 for value in p.get("coverPosition","50% 50%").split()):
            raise ValueError("Cover focus must be two percentages from 0 to 100")
        for name in [p.get("cover")]+[m["src"] for m in p["media"]]:
            if not name:continue
            path=local_asset(root,name)
            if p.get("visible") and not path.is_file() and path not in pending:raise ValueError(f"Missing project asset: {name}")
        for media in p["media"]:
            if media["kind"] not in ("image","video","document"):raise ValueError("Unsupported project media type")
            if not media["src"]:raise ValueError("Media needs a file")


def media_html(media):
    soup=BeautifulSoup(media.get("html") or '<figure class="project-media"></figure>',"html.parser")
    fig=soup.find("figure")
    if media["kind"]=="image":
        node=fig.find("img")
        if node is None:node=soup.new_tag("img",loading="lazy",decoding="async");fig.insert(0,node)
        node["src"]=media["src"];node["alt"]=media.get("alt","")
    elif media["kind"]=="video":
        node=fig.find("video")
        if node is None:
            node=soup.new_tag("video",controls="",preload="metadata");fig.insert(0,node)
        source=node.find("source")
        if source:source["src"]=media["src"]
        else:node["src"]=media["src"]
    else:
        node=fig.find("a")
        if node is None:node=soup.new_tag("a");fig.insert(0,node)
        node["href"]=media["src"];node.string=media.get("caption") or Path(media["src"]).name
    caption=fig.find("figcaption")
    if caption:caption.decompose()
    if media.get("caption") or media.get("credit"):
        caption=soup.new_tag("figcaption");fig.append(caption)
        for tag,cls,key in (("span","caption-main","caption"),("small",None,"credit")):
            if media.get(key):
                node=soup.new_tag(tag);node.string=media[key]
                if cls:node["class"]=cls
                caption.append(node)
    return str(fig)


def render_project(project):
    if not project.get("visible",True):return ""
    if project.get("legacyHtml") and snapshot(project)==project.get("baseline"):return project["legacyHtml"]
    template=project.get("legacyHtml") or '<details class="project"><summary class="project-header"><span class="project-header-bg" aria-hidden="true"></span><span class="project-header-shade" aria-hidden="true"></span><span class="project-header-text"></span><span class="project-chevron-wrap" aria-hidden="true"><span class="project-chevron"></span></span></summary><div class="project-body"><h2></h2><p class="lead"></p><hr class="project-title-divider"><div class="project-prose"></div><div class="project-gallery" data-justified-gallery></div></div></details>'
    soup=BeautifulSoup(template,"html.parser");section=soup.find("details");section["id"]=project["id"]
    if project.get("expanded"):section["open"]=""
    else:section.attrs.pop("open",None)
    section.select_one(".project-header-text").string=project["title"]
    section.select_one(".project-body > h2").string=project.get("heading","")
    section.select_one(".project-body > .lead").string=project.get("context","")
    section.select_one(".project-header-bg")["style"]=f"background-image: url('{project.get('cover','')}'); background-position: {project.get('coverPosition','50% 50%')}"
    for selector,fragment in ((".project-prose",project["bodyHtml"]),(".project-gallery","".join(media_html(m) for m in project["media"]))):
        node=section.select_one(selector);node.clear()
        for child in list(BeautifulSoup(fragment,"html.parser").contents):node.append(child)
    return str(section)


START="<!-- portfolio-studio:engineering:start -->"
END="<!-- portfolio-studio:engineering:end -->"


def render_page(catalog,page):
    content="".join(render_project(p)+p.get("separator","\n") for p in catalog["projects"] if p.get("visible",True))
    if START in page and END in page:
        a=page.index(START)+len(START);b=page.index(END)
        return page[:a]+"\n"+content+"\n"+page[b:]
    matches=list(re.finditer(r"<details\b.*?</details>",page,re.S|re.I))
    if not matches:raise ValueError("Engineering publication markers missing")
    # Unchanged migration is byte-for-byte stable; add markers only when needed.
    original=page[matches[0].start():matches[-1].end()]
    if content==original:return page
    return page[:matches[0].start()]+START+"\n"+content+"\n"+END+page[matches[-1].end():]


def save_catalog(root,catalog,expected_catalog,expected_page,pending=None):
    root=Path(root);target=root/"data"/"engineering-catalog.json";page=root/"engineeringdesign.html"
    pending=pending or {};validate(catalog,root,pending)
    for path,data in pending.items():
        if not Path(path).resolve().is_relative_to(root.resolve()):raise ValueError("New media leaves repository")
        if Path(path).exists() and Path(path).read_bytes()!=data:raise FileExistsError(f"Media changed elsewhere: {Path(path).name}")
    if (target.read_bytes() if target.exists() else None)!=expected_catalog or page.read_bytes()!=expected_page:
        raise ValueError("Engineering content changed elsewhere. Reload before saving.")
    updated=render_page(catalog,expected_page.decode("utf-8")).encode("utf-8")
    import datetime
    backup=backup_root("project-backups")/datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    backup.mkdir(parents=True,exist_ok=False);(backup/page.name).write_bytes(expected_page)
    if expected_catalog is not None:(backup/target.name).write_bytes(expected_catalog)
    payload=dict(pending);payload[page]=updated
    payload[target]=(json.dumps(catalog,ensure_ascii=False,indent=2)+"\n").encode("utf-8")
    target.parent.mkdir(parents=True,exist_ok=True)
    with asset_transaction(payload):
        # Validate the installed catalog before committing the transaction.
        validate(json.loads(target.read_text(encoding="utf-8")),root)
    return backup
