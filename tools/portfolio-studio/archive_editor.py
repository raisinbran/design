"""Archive Collections tab: collection and image metadata editor with safe local save."""
import copy
import hashlib
import re
import tkinter as tk
from pathlib import Path
from tkinter import ttk, filedialog, messagebox, simpledialog
from PIL import Image, ImageOps
from photo_viewport import PhotoViewport
from editor_tabs import create_editor_tabs
import archive_catalog as catalog
import archive_writer as writer
from platform_support import open_path, cache_path
from thumbnail_list import ThumbnailList

IMAGE_TYPES = {'.jpg', '.jpeg', '.png', '.webp'}


class ArchiveEditor(ttk.Frame):
    def __init__(self, parent, root=catalog.ROOT):
        super().__init__(parent)
        self.root = Path(root).resolve()
        self.data = catalog.read_catalog(self.root)
        self.initial = copy.deepcopy(self.data)
        self.expected_page = (self.root/'creativedesign.html').read_bytes()
        self.expected_settings = (self.root/'js/archive-photo-settings.js').read_bytes()
        self.expected_catalog = (self.root/'data/archive-catalog.json').read_bytes()
        self.pending = {}
        self.history = []
        self.index = self.media_index = None
        self.loading = False
        bar = ttk.Frame(self, padding=(10, 5));bar.pack(fill='x')
        for name, func in (
            ('Reset', self.reload), ('Add collection…', self.add_collection),
            ('Remove collection…', self.remove_collection),
            ('Move up', lambda:self.move_collection(-1)),
            ('Move down', lambda:self.move_collection(1)),
            ('Undo', self.undo), ('Preview', self.preview)):
            btn=ttk.Button(bar,text=name,command=func)
            btn.pack(side='left',padx=3)
            if name=='Reset':self.reset_button=btn
            if name=='Undo':self.undo_button=btn
        self.save_button = ttk.Button(bar,text='Save changes locally',command=self.save)
        self.save_button.pack(side='left',padx=4)
        body = ttk.Panedwindow(self, orient='horizontal');body.pack(fill='both',expand=True,padx=10,pady=5)
        panel = ttk.Frame(body);body.add(panel,weight=1)
        ttk.Label(panel,text='Collections').pack(anchor='w',pady=(0,4))
        self.collections = ThumbnailList(panel)
        self.collections.tree.column('#0',width=215,minwidth=160)
        self.collections.pack(fill='both',expand=True)
        self.collections.bind('<<ListboxSelect>>',self.select_collection)
        right=ttk.Frame(body);body.add(right,weight=4)
        self.secondary_tab_holder,tabs=create_editor_tabs(right,('Collection details','Images and captions'))
        details = ttk.Frame(tabs,padding=12);tabs.add(details,text='Collection details')
        details.columnconfigure(1,weight=1)
        self.values = {key:tk.StringVar() for key in ('title','heading','context','cover','coverPosition','coverSize','headerMinHeight')}
        labels = (('title','Collection title'),('heading','Heading'),('context','Introduction'),
                  ('cover','Cover image'),('coverPosition','Cover focus (X% Y%)'),
                  ('coverSize','Cover size'),('headerMinHeight','Header minimum height'))
        for row,(key,label) in enumerate(labels):
            ttk.Label(details,text=label).grid(row=row,column=0,sticky='w',padx=(0,10),pady=5)
            if key=='coverSize':
                control=ttk.Combobox(details,textvariable=self.values[key],values=('cover','contain','auto'),state='readonly')
            else:control=ttk.Entry(details,textvariable=self.values[key])
            control.grid(row=row,column=1,sticky='ew',pady=5)
            if key=='cover':
                control.configure(state='readonly')
                ttk.Button(details,text='Use selected image',command=self.use_cover).grid(row=row,column=2,padx=5)
        self.expanded=tk.BooleanVar()
        ttk.Checkbutton(details,text='Initially expanded',variable=self.expanded,command=self.changed).grid(
            row=len(labels),column=0,columnspan=2,sticky='w',pady=8)
        media_page=ttk.Frame(tabs,padding=10);tabs.add(media_page,text='Images and captions')
        mtools=ttk.Frame(media_page);mtools.pack(fill='x',pady=(0,6))
        for name,func in (('Add images…',self.add_media),('Remove image…',self.remove_media),
                          ('Move up',lambda:self.move_media(-1)),('Move down',lambda:self.move_media(1)),
                          ('Use as cover',self.use_cover),('Open image',self.open_media)):
            ttk.Button(mtools,text=name,command=func).pack(side='left',padx=3)
        mpane=ttk.Panedwindow(media_page,orient='horizontal');mpane.pack(fill='both',expand=True)
        mleft=ttk.Frame(mpane);mpane.add(mleft,weight=1)
        self.media=ThumbnailList(mleft);self.media.tree.column('#0',width=220,minwidth=160)
        self.media.pack(fill='both',expand=True)
        self.media.bind('<<ListboxSelect>>',self.select_media)
        fields=ttk.Frame(mpane,padding=(12,0,0,0));mpane.add(fields,weight=3)
        fields.columnconfigure(1,weight=1)
        fields.rowconfigure(0,weight=1)
        self.preview_viewport=PhotoViewport(fields)
        self.preview_viewport.set_mode('pan')
        self.preview_viewport.grid(row=0,column=0,columnspan=2,sticky='nsew',pady=(0,10))
        self.media_values={k:tk.StringVar() for k in ('alt','caption','credit','position','cropMode','displayRatio','prominence')}
        mlabels=(('alt','Accessible description'),('caption','Caption'),('credit','Credit'),
                 ('position','Focus (X% Y%)'),('cropMode','Crop mode'),
                 ('displayRatio','Display ratio (blank = auto)'),('prominence','Prominence'))
        for row,(key,label) in enumerate(mlabels):
            ttk.Label(fields,text=label).grid(row=row+1,column=0,sticky='w',padx=(0,10),pady=5)
            if key=='prominence':
                control=ttk.Combobox(fields,textvariable=self.media_values[key],
                                     values=('normal','low','portraitBoost','featured'),state='readonly')
            elif key=='cropMode':
                control=ttk.Combobox(fields,textvariable=self.media_values[key],
                                     values=('natural','square'),state='readonly')
            else:control=ttk.Entry(fields,textvariable=self.media_values[key])
            control.grid(row=row+1,column=1,sticky='ew',pady=5)
        ttk.Label(fields,text='Removing an image never deletes its original file.').grid(
            row=len(mlabels)+1,column=0,columnspan=2,sticky='w',pady=7)
        self.status=tk.StringVar(value='Changes remain local until saved.')
        ttk.Label(self,textvariable=self.status,padding=(10,3)).pack(fill='x')
        for v in (*self.values.values(),*self.media_values.values()):
            v.trace_add('write',lambda *_:self.changed())
        self.populate()

    def changed(self):
        if self.loading:return
        self.store()
        self._refresh_actions()

    def _refresh_actions(self):
        modified=self.data!=self.initial or bool(self.used_pending())
        self.save_button.configure(state='normal' if modified else 'disabled')
        self.reset_button.configure(state='normal' if modified else 'disabled')
        self.undo_button.configure(state='normal' if self.history else 'disabled')

    def asset_preview(self,src):
        if not src:return None
        try:path=catalog.local_asset(self.root,src)
        except ValueError:return None
        if path not in self.pending:return path
        folder=cache_path()/'archive-previews'/'pending-thumbnails'
        folder.mkdir(parents=True,exist_ok=True)
        target=folder/(hashlib.sha256(self.pending[path]).hexdigest()[:16]+path.suffix)
        if not target.is_file():target.write_bytes(self.pending[path])
        return target

    def store_media(self):
        if self.loading or self.index is None or self.media_index is None:return
        items=self.data['collections'][self.index]['media']
        if self.media_index>=len(items):return
        for key,value in self.media_values.items():
            raw=value.get()
            if key=='displayRatio':
                try:items[self.media_index][key]=float(raw) if raw.strip() else None
                except ValueError:items[self.media_index][key]=raw
            else:items[self.media_index][key]=raw

    def store(self):
        if self.loading or self.index is None:return
        self.store_media()
        c=self.data['collections'][self.index]
        for key,v in self.values.items():c[key]=v.get()
        c['expanded']=self.expanded.get()

    def checkpoint(self):
        self.store();self.history.append(copy.deepcopy(self.data));self.history=self.history[-25:]

    def populate(self,selected=0):
        self.loading=True;self.index=self.media_index=None
        self.collections.delete(0,'end')
        for c in self.data['collections']:
            self.collections.insert('end','  '+c['title'],self.asset_preview(c['cover']),placeholder='No cover')
        self.loading=False
        if self.data['collections']:
            selected=max(0,min(selected,len(self.data['collections'])-1))
            self.collections.selection_set(selected);self.collections.activate(selected)
            self.load_collection(selected)
        self._refresh_actions()

    def select_collection(self,event=None):
        rows=self.collections.curselection()
        if rows and rows[0]!=self.index:self.store();self.load_collection(rows[0])

    def load_collection(self,index):
        self.loading=True;self.index=index;self.media_index=None
        c=self.data['collections'][index]
        for key,v in self.values.items():v.set(c.get(key,''))
        self.expanded.set(c['expanded']);self.loading=False
        self.populate_media();self.status.set(f"{c['title']} · {len(c['media'])} image(s)")

    def populate_media(self,selected=0):
        self.loading=True;self.media_index=None;self.media.delete(0,'end')
        if self.index is not None:
            for m in self.data['collections'][self.index]['media']:
                self.media.insert('end',Path(m['src']).name,self.asset_preview(m['src']),placeholder='No image')
        for v in self.media_values.values():v.set('')
        self.loading=False
        if not self.media.rows:self.preview_viewport.set_source(None)
        if self.media.rows:
            selected=max(0,min(selected,len(self.media.rows)-1))
            self.media.selection_set(selected);self.media.activate(selected);self.load_media(selected)

    def select_media(self,event=None):
        rows=self.media.curselection()
        if rows and rows[0]!=self.media_index:self.store_media();self.load_media(rows[0])

    def load_media(self,index):
        m=self.data['collections'][self.index]['media'][index]
        self.loading=True;self.media_index=index
        for key,v in self.media_values.items():
            val=m.get(key);v.set('' if val is None else str(val))
        self.loading=False
        self._show_media_preview(m['src'])

    def _show_media_preview(self,src):
        try:
            path=self.asset_preview(src)
            with Image.open(path) as raw:
                image=ImageOps.exif_transpose(raw).convert('RGB')
                image.thumbnail((1400,1400),Image.Resampling.LANCZOS)
            self.preview_viewport.set_source(image,identity=(src,self.media_index))
        except (OSError,ValueError,TypeError):
            self.preview_viewport.set_source(None)

    def unique_id(self,title):
        base=re.sub('[^a-z0-9]+','-',title.lower()).strip('-') or 'collection'
        if not base[0].isalpha():base='collection-'+base
        used={c['id'] for c in self.data['collections']};i=2;key=base
        while key in used:key=f'{base}-{i}';i+=1
        return key

    def add_collection(self):
        title=simpledialog.askstring('New Archive collection','Title:',parent=self)
        if not title or not title.strip():return
        self.checkpoint();c=copy.deepcopy(self.data['collections'][0]);c.update(
            id=self.unique_id(title),title=title.strip(),heading=title.strip(),context='',media=[],expanded=False)
        self.data['collections'].append(c);self.populate(len(self.data['collections'])-1)

    def remove_collection(self):
        if self.index is None:return
        if len(self.data['collections'])==1:
            messagebox.showinfo('Archive','Keep at least one collection.',parent=self);return
        if not messagebox.askyesno('Remove Archive collection',
             'Remove this collection from the local page? Images will remain on disk.',parent=self):return
        self.checkpoint();i=self.index;self.data['collections'].pop(i)
        self.populate(min(i,len(self.data['collections'])-1))

    def move_collection(self,offset):
        if self.index is None:return
        j=self.index+offset;items=self.data['collections']
        if not 0<=j<len(items):return
        self.checkpoint();items[self.index],items[j]=items[j],items[self.index]
        self.populate(j)

    def undo(self):
        if self.history:self.data=self.history.pop();self.populate(self.index or 0)

    def add_media(self):
        if self.index is None:return
        names=filedialog.askopenfilenames(parent=self,title='Add Archive images',
                   filetypes=[('Web images','*.jpg *.jpeg *.png *.webp'),('All files','*.*')])
        if not names:return
        pending=[]
        used={m['src'].casefold() for c in self.data['collections'] for m in c['media']}
        try:
            for name in names:
                source=Path(name).resolve()
                if source.suffix.lower() not in IMAGE_TYPES:raise ValueError(f'Unsupported image: {source.name}')
                if source.stat().st_size>50*1024*1024:raise ValueError(f'Image exceeds 50 MB: {source.name}')
                with Image.open(source) as image:image.verify()
                if source.is_relative_to(self.root):
                    relative=source.relative_to(self.root).as_posix();blob=None
                else:
                    blob=source.read_bytes()
                    stem=re.sub(r'[^A-Za-z0-9_-]+','-',source.stem).strip('-') or 'photo'
                    relative=(f"assets/archive/{self.data['collections'][self.index]['id']}/"
                              f"{stem}-{hashlib.sha256(blob).hexdigest()[:12]}{source.suffix.lower()}")
                if relative.casefold() in used:raise ValueError(f'Image already referenced: {relative}')
                used.add(relative.casefold());target=catalog.local_asset(self.root,relative)
                if blob is not None and target.exists() and target.read_bytes()!=blob:
                    raise ValueError('Archive media destination conflicts with an existing file')
                pending.append((relative,target,blob))
        except (OSError,ValueError) as exc:
            messagebox.showerror('Add images failed',str(exc),parent=self);return
        self.checkpoint();c=self.data['collections'][self.index]
        ids={m['id'] for group in self.data['collections'] for m in group['media']}
        for relative,target,blob in pending:
            if blob is not None:self.pending[target]=blob
            i=1;mid=f"{c['id']}-media-{i:02d}"
            while mid in ids:i+=1;mid=f"{c['id']}-media-{i:02d}"
            ids.add(mid)
            c['media'].append(dict(id=mid,src=relative,alt=Path(relative).stem.replace('-',' '),
                caption='',credit='',cropMode='natural',displayRatio=None,position='50% 50%',
                prominence='normal',figureAttributes={'class':['project-media']},
                imageAttributes={'loading':'lazy','decoding':'async'}))
        self.populate_media(len(c['media'])-1);self.changed()

    def remove_media(self):
        if self.index is None or self.media_index is None:return
        if not messagebox.askyesno('Remove Archive image',
                 'Remove from the collection, retaining the original file?',parent=self):return
        self.checkpoint();i=self.media_index
        self.data['collections'][self.index]['media'].pop(i)
        self.populate_media(max(0,i-1));self.changed()

    def move_media(self,offset):
        if self.index is None or self.media_index is None:return
        j=self.media_index+offset;items=self.data['collections'][self.index]['media']
        if not 0<=j<len(items):return
        self.checkpoint();items[self.media_index],items[j]=items[j],items[self.media_index]
        self.populate_media(j);self.changed()

    def use_cover(self):
        if self.index is None or self.media_index is None:return
        self.values['cover'].set(self.data['collections'][self.index]['media'][self.media_index]['src'])

    def open_media(self):
        if self.index is None or self.media_index is None:return
        path=catalog.local_asset(self.root,self.data['collections'][self.index]['media'][self.media_index]['src'])
        if path not in self.pending:open_path(path)
        else:
            dest=cache_path()/'archive-previews'/path.name;dest.parent.mkdir(parents=True,exist_ok=True)
            dest.write_bytes(self.pending[path]);open_path(dest)

    def used_pending(self):
        used=set()
        for c in self.data['collections']:
            used.add(c['cover']);used.update(m['src'] for m in c['media'])
        return {path:blob for path,blob in self.pending.items() if path.relative_to(self.root).as_posix() in used}

    def preview(self):
        self.store()
        try:
            pending=self.used_pending()
            page=writer.render_page(copy.deepcopy(self.data),self.root,self.expected_page,pending).decode('utf-8')
            settings=writer.render_settings(self.data)
            folder=cache_path()/'archive-previews';folder.mkdir(parents=True,exist_ok=True)
            for path,blob in pending.items():
                dest=folder/path.relative_to(self.root);dest.parent.mkdir(parents=True,exist_ok=True)
                dest.write_bytes(blob)
                page=page.replace(path.relative_to(self.root).as_posix(),dest.as_uri())
            page=page.replace('<head>',f'<head><base href="{self.root.as_uri()}/">',1)
            (folder/'archive-photo-settings.js').write_bytes(settings)
            page=page.replace('js/archive-photo-settings.js',(folder/'archive-photo-settings.js').as_uri())
            dest=folder/'archive-preview.html';dest.write_text(page,encoding='utf-8');open_path(dest)
        except (OSError,ValueError,KeyError,TypeError) as exc:
            messagebox.showerror('Archive preview failed',str(exc),parent=self)

    def save(self):
        self.store();pending=self.used_pending()
        if self.data==self.initial and not pending:return True
        if not messagebox.askyesno('Save changes locally',
             'Update local Archive HTML, catalog, and prominence settings? No files will be pushed to GitHub.',parent=self):return False
        try:
            backup=writer.save(self.root,self.data,self.expected_catalog,self.expected_page,self.expected_settings,pending)
            self.data=catalog.read_catalog(self.root);self.initial=copy.deepcopy(self.data)
            self.expected_catalog=(self.root/'data/archive-catalog.json').read_bytes()
            self.expected_page=(self.root/'creativedesign.html').read_bytes()
            self.expected_settings=(self.root/'js/archive-photo-settings.js').read_bytes()
            self.pending={};self.history=[];self.populate(self.index or 0)
            self.status.set(f'Archive saved. Backup: {backup}');return True
        except (OSError,ValueError,KeyError,TypeError) as exc:
            messagebox.showerror('Archive save failed',str(exc),parent=self);return False

    def reload(self):
        self.store()
        if (self.data!=self.initial or self.used_pending()) and not messagebox.askyesno(
              'Reset Archive','Discard unsaved Archive edits?',parent=self):return
        self.data=catalog.read_catalog(self.root);self.initial=copy.deepcopy(self.data)
        self.expected_catalog=(self.root/'data/archive-catalog.json').read_bytes()
        self.expected_page=(self.root/'creativedesign.html').read_bytes()
        self.expected_settings=(self.root/'js/archive-photo-settings.js').read_bytes()
        self.pending={};self.history=[];self.populate()

    def can_close(self):
        self.store()
        if self.data==self.initial and not self.used_pending():return True
        answer=messagebox.askyesnocancel('Unsaved Archive edits',
                  'Save Archive changes before closing?',parent=self)
        return False if answer is None else self.save() if answer else True
