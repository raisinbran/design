"""Responsive, crop-first image viewport shared by both Portfolio Studio editors.

Only the visible part of a zoomed image is rendered. No full-resolution
PhotoImage is created at 400% inspection zoom. Crops are normalized x/y/w/h
rectangles, not image pixels. No originals are modified.
"""
import math
import tkinter as tk
from tkinter import ttk
from PIL import Image, ImageTk

MIN_CROP = 0.012


def normalize_crop(rect, minimum=MIN_CROP):
    if rect is None:
        return None
    if not isinstance(rect, dict):
        raise ValueError("Crop must be a rectangle object.")
    try:
        x, y, w, h = (float(rect[k]) for k in ("x", "y", "width", "height"))
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("Crop requires numeric x, y, width and height.") from exc
    if not all(math.isfinite(t) for t in (x, y, w, h)):
        raise ValueError("Crop coordinates must be finite.")
    if x < -1e-6 or y < -1e-6 or w < minimum or h < minimum or x + w > 1.000001 or y + h > 1.000001:
        raise ValueError("Crop must be entirely inside the photograph.")
    return {k: round(v, 6) for k, v in zip(("x", "y", "width", "height"),
                                             (max(0, x), max(0, y), w, h))}


def crop_from_points(a, b, minimum=MIN_CROP):
    x0, x1 = sorted((max(0.0, min(1.0, a[0])), max(0.0, min(1.0, b[0]))))
    y0, y1 = sorted((max(0.0, min(1.0, a[1])), max(0.0, min(1.0, b[1]))))
    if x1 - x0 < minimum or y1 - y0 < minimum:
        return None
    return normalize_crop({"x": x0, "y": y0, "width": x1-x0, "height": y1-y0})


def effective_ratio(source_ratio, crop):
    rect = normalize_crop(crop) if crop is not None else None
    return float(source_ratio) * rect["width"] / rect["height"] if rect else float(source_ratio)


class PhotoViewport(ttk.Frame):
    """Viewport with independent inspect zoom/pan and non-destructive crop drag.

    Coordinates use the oriented and, where applicable, straightened image
    (the same image input as the image exporter). `crop` is persisted as
    fractions of this final publication image before resizing.
    """

    def __init__(self, parent, *, on_crop=None, on_horizon=None, on_vertical=None, status=None):
        super().__init__(parent)
        self.canvas = tk.Canvas(self, bg="#e7e9eb", highlightthickness=0)
        self.xbar = ttk.Scrollbar(self, orient="horizontal", command=self.scroll_x)
        self.ybar = ttk.Scrollbar(self, orient="vertical", command=self.scroll_y)
        self.canvas.grid(row=0, column=0, sticky="nsew")
        self.ybar.grid(row=0, column=1, sticky="ns")
        self.xbar.grid(row=1, column=0, sticky="ew")
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(0, weight=1)

        self.source = None
        self.identity = None
        self.zoom = 1.0
        self.mode = "crop"
        self.crop = None
        self.on_crop = on_crop
        self.on_horizon = on_horizon
        self.on_vertical = on_vertical
        self.aspect_ratio = None
        self.status = status
        self.pan_x = self.pan_y = 0.0
        self.photo = None
        self._pending = None
        self._start = None
        self._candidate = None
        self._drag_pan = None
        self._edit = None
        self.grid_mode = "off"
        self._canvas_geometry = None

        self.canvas.bind("<Configure>", self._schedule_render)
        self.canvas.bind("<ButtonPress-1>", self._start_draw)
        self.canvas.bind("<Button-3>", self.right_click)
        if self.tk.call("tk","windowingsystem")=="aqua":self.canvas.bind("<Control-Button-1>", self.right_click)
        self.canvas.bind("<Escape>", self.cancel_draw)
        self.winfo_toplevel().bind("<Escape>", self.cancel_draw,add="+")
        self.bind("<Destroy>",self._cancel_pending_render,add="+")
        self.canvas.bind("<B1-Motion>", self._move_draw)
        self.canvas.bind("<ButtonRelease-1>", self._end_draw)
        self.canvas.bind("<Motion>", self._update_cursor)
        self.canvas.bind("<ButtonPress-2>", self._start_pan)
        self.canvas.bind("<B2-Motion>", self._move_pan)
        self.canvas.bind("<Shift-ButtonPress-1>", self._start_pan)
        self.canvas.bind("<Shift-B1-Motion>", self._move_pan)
        self.canvas.bind("<Control-MouseWheel>", self._wheel_zoom)
        self.canvas.bind("<MouseWheel>", self._wheel_pan)
        self.canvas.bind("<Button-4>", lambda e: self._unix_wheel(e, -1))
        self.canvas.bind("<Button-5>", lambda e: self._unix_wheel(e, 1))

    def _cancel_pending_render(self,event):
        if event.widget is self and self._pending is not None:
            try:self.after_cancel(self._pending)
            except tk.TclError:pass
            self._pending=None

    def set_source(self, image, identity=None):
        if image is None:
            self.source = None
            self.identity = None
            self.photo = None
            self.pan_x = self.pan_y = 0
            self._start = self._candidate = self._edit = self._drag_pan = None
            self.canvas.configure(cursor="arrow")
            self.canvas.delete("all")
            return
        if not isinstance(image, Image.Image):
            raise TypeError("Image must be PIL.Image")
        if identity != self.identity:
            self.source = image
            self.identity = identity
            self.pan_x = self.pan_y = 0
            self._schedule_render()

    def set_mode(self, value):
        if value not in ("crop", "horizon", "vertical", "pan"):
            raise ValueError("Unsupported viewport interaction mode.")
        self.mode = value
        self._start = None
        self._drag_pan = None
        self._draw_overlay()

    def set_aspect_ratio(self, ratio):
        self.aspect_ratio = ratio
        if self.crop is not None and ratio and self.source:
            c=dict(self.crop)
            # Keep crop center, change width first or height if constrained.
            required = ratio / (self.source.width / self.source.height)
            center_x=c["x"]+c["width"]/2
            center_y=c["y"]+c["height"]/2
            w=min(c["width"],c["height"]*required)
            h=w/required
            if h>c["height"]:
                h=c["height"]
                w=h*required
            c={"x":max(0,min(1-w,center_x-w/2)),
               "y":max(0,min(1-h,center_y-h/2)),
               "width":w,"height":h}
            self.set_crop(c,notify=True)

    def _constrain_crop_ratio(self,c):
        if not self.aspect_ratio or self.source is None or c is None:
            return c
        required=self.aspect_ratio/(self.source.width/self.source.height)
        # The anchor is the upper-left corner; keep crop in image bounds.
        w=c["width"];h=c["height"]
        if w/h > required:
            w=h*required
        else:
            h=w/required
        return normalize_crop({"x":c["x"],"y":c["y"],
                               "width":min(w,1-c["x"]),"height":min(h,1-c["y"])})

    def _anchored_resize(self, original, kind, box):
        """Keep opposite corner or edge fixed when resizing to a locked ratio."""
        if self.aspect_ratio is None or self.source is None:
            return normalize_crop(box)
        required=self.aspect_ratio/(self.source.width/self.source.height)
        if required<=0:return normalize_crop(box)
        ox,oy=original["x"],original["y"]
        ow,oh=original["width"],original["height"]
        x,y=box["x"],box["y"]
        w,h=box["width"],box["height"]
        if len(kind)==2:  # Corner: fixed diagonal opposite corner
            ax=ox+ow if "w" in kind else ox
            ay=oy+oh if "n" in kind else oy
            raww=abs(ax-(x if "w" in kind else x+w))
            rawh=abs(ay-(y if "n" in kind else y+h))
            extent_w=raww if abs(raww-ow)>=abs(rawh-oh)*required else rawh*required
            maxw=min(ax if "w" in kind else 1-ax,
                     (ay if "n" in kind else 1-ay)*required)
            minimum=MIN_CROP*max(1,required)
            if maxw<minimum:return dict(original)
            nw=max(minimum,min(extent_w,maxw))
            nh=nw/required
            result={"x":ax-nw if "w" in kind else ax,
                    "y":ay-nh if "n" in kind else ay,
                    "width":nw,"height":nh}
        elif kind in ("w","e"):
            anchor=ox+ow if kind=="w" else ox
            center=oy+oh/2
            maxw=min(anchor if kind=="w" else 1-anchor,
                     2*min(center,1-center)*required)
            minimum=MIN_CROP*max(1,required)
            if maxw<minimum:return dict(original)
            nw=max(minimum,min(w,maxw));nh=nw/required
            result={"x":anchor-nw if kind=="w" else anchor,
                    "y":center-nh/2,"width":nw,"height":nh}
        else: # N/S: fixed opposing horizontal edge, centered on original
            anchor=oy+oh if kind=="n" else oy
            center=ox+ow/2
            maxh=min(anchor if kind=="n" else 1-anchor,
                     2*min(center,1-center)/required)
            minimum=MIN_CROP*max(1,1/required)
            if maxh<minimum:return dict(original)
            nh=max(minimum,min(h,maxh));nw=nh*required
            result={"x":center-nw/2,"y":anchor-nh if kind=="n" else anchor,
                    "width":nw,"height":nh}
        return normalize_crop(result)

    def set_crop(self, value, notify=False):
        self.crop = normalize_crop(value) if value is not None else None
        self._draw_overlay()
        if notify and self.on_crop:
            self.on_crop(self.crop)

    def set_grid(self, value):
        if value not in ("off", "thirds", "center", "golden"):
            raise ValueError("Unknown composition grid")
        self.grid_mode = value
        self._draw_overlay()

    def crop_preview(self):
        if self.source is None:
            return None
        c = self.crop
        if c is None:
            return self.source.copy()
        w, h = self.source.size
        box = (round(w*c["x"]), round(h*c["y"]),
               round(w*(c["x"]+c["width"])), round(h*(c["y"]+c["height"])))
        return self.source.crop(box)

    def _crop_rect_pixels(self):
        if not self.crop: return None
        ox,oy,iw,ih,_,_ = self._geometry()
        c=self.crop
        return (ox+c["x"]*iw, oy+c["y"]*ih,
                ox+(c["x"]+c["width"])*iw, oy+(c["y"]+c["height"])*ih)

    def _hit_crop(self, x, y):
        box=self._crop_rect_pixels()
        if not box:return None
        x0,y0,x1,y1=box
        radius=16
        near_x = min(((abs(x-x0),"w"),(abs(x-x1),"e")))[1] if min(abs(x-x0),abs(x-x1))<=radius else ""
        near_y = min(((abs(y-y0),"n"),(abs(y-y1),"s")))[1] if min(abs(y-y0),abs(y-y1))<=radius else ""
        if near_x and near_y:return near_y+near_x
        if near_x and y0-radius<=y<=y1+radius:return near_x
        if near_y and x0-radius<=x<=x1+radius:return near_y
        if near_x and y0<=y<=y1:return near_x
        if x0<x<x1 and y0<y<y1:return "move"
        return None

    def _update_cursor(self, event):
        if self.source is None:
            self.canvas.configure(cursor="arrow")
            return
        if self._start is not None:return
        hit=self._hit_crop(event.x,event.y) if self.mode=="crop" else None
        cursor={"nw":"size_nw_se","se":"size_nw_se","ne":"size_ne_sw","sw":"size_ne_sw",
                "n":"size_ns","s":"size_ns","w":"size_we","e":"size_we","move":"fleur"}.get(hit)
        try:self.canvas.configure(cursor=cursor or ("fleur" if self.mode=="pan" else "crosshair"))
        except tk.TclError:self.canvas.configure(cursor="arrow" if self.mode=="pan" else "crosshair")

    def _grid(self, x0,y0,x1,y1):
        if self.grid_mode=="off":return
        fractions = ([1/3,2/3] if self.grid_mode=="thirds" else
                     [0.5] if self.grid_mode=="center" else
                     [0.382,0.618])
        for f in fractions:
            x=x0+(x1-x0)*f
            y=y0+(y1-y0)*f
            self.canvas.create_line(x,y0,x,y1,fill="#ffffff",width=1,dash=(3,4),tags="overlay")
            self.canvas.create_line(x0,y,x1,y,fill="#ffffff",width=1,dash=(3,4),tags="overlay")

    def set_zoom(self, value):
        z = min(6.0, max(1.0, float(value)))
        if abs(z - self.zoom) > 1e-6:
            vw, vh = self._viewport_dims()
            old_virtual = self._virtual_size()
            ox, oy = self._origin(*old_virtual, vw, vh)
            center_x = (vw * .5 - ox) / max(1.0, old_virtual[0])
            center_y = (vh * .5 - oy) / max(1.0, old_virtual[1])
            self.zoom = z
            new_virtual = self._virtual_size()
            self.pan_x = max(0, center_x * new_virtual[0] - vw / 2)
            self.pan_y = max(0, center_y * new_virtual[1] - vh / 2)
            self._schedule_render()

    def _viewport_dims(self):
        return max(1, self.canvas.winfo_width()), max(1, self.canvas.winfo_height())

    def _virtual_size(self):
        if self.source is None:
            return 1.0, 1.0
        vw, vh = self._viewport_dims()
        # Fit photograph at zoom 1.0, then magnify the visual content.
        base_scale = min((vw - 6) / self.source.width, (vh - 6) / self.source.height)
        scale = max(0.0001, base_scale * self.zoom)
        return self.source.width * scale, self.source.height * scale

    def _origin(self, iw, ih, vw, vh):
        if iw <= vw:
            ox = (vw - iw) / 2
            self.pan_x = 0
        else:
            self.pan_x = max(0, min(self.pan_x, iw - vw))
            ox = -self.pan_x
        if ih <= vh:
            oy = (vh - ih) / 2
            self.pan_y = 0
        else:
            self.pan_y = max(0, min(self.pan_y, ih - vh))
            oy = -self.pan_y
        return ox, oy

    def _geometry(self):
        iw, ih = self._virtual_size()
        vw, vh = self._viewport_dims()
        ox, oy = self._origin(iw, ih, vw, vh)
        return ox, oy, iw, ih, vw, vh

    def point_to_image(self, x, y):
        ox, oy, iw, ih, _, _ = self._geometry()
        nx, ny = (x - ox) / iw, (y - oy) / ih
        return min(1.0, max(0, nx)), min(1.0, max(0, ny))

    def _inside(self, x, y):
        ox, oy, iw, ih, _, _ = self._geometry()
        return ox <= x <= ox + iw and oy <= y <= oy + ih

    def _schedule_render(self, _event=None):
        # Throttle rather than debounce. Continuous dragging must keep
        # updating the viewport, not wait until the pointer stops moving.
        if self._pending is None:
            self._pending = self.after(32, self.render)

    def render(self):
        self._pending = None
        self.canvas.delete("photo")
        if self.source is None:
            self.canvas.delete("overlay")
            self.photo = None
            return
        ox, oy, iw, ih, vw, vh = self._geometry()
        self._canvas_geometry = (ox, oy, iw, ih)
        # Render ONLY the visible window, instead of scaling a giant zoomed
        # PhotoImage. At 4x, most pixels of the source never need drawing.
        visible_x0 = max(0.0, -ox)
        visible_y0 = max(0.0, -oy)
        visible_x1 = min(iw, vw - ox)
        visible_y1 = min(ih, vh - oy)
        if visible_x1 <= visible_x0 or visible_y1 <= visible_y0:
            return
        sx = self.source.width / iw
        sy = self.source.height / ih
        bounds = (visible_x0 * sx, visible_y0 * sy,
                  visible_x1 * sx, visible_y1 * sy)
        # PIL supports fractional crop coordinates. Keep output viewport-sized.
        part = self.source.crop(bounds)
        dest_w = max(1, round(visible_x1 - visible_x0))
        dest_h = max(1, round(visible_y1 - visible_y0))
        part = part.resize((dest_w, dest_h), Image.Resampling.BILINEAR)
        self.photo = ImageTk.PhotoImage(part)
        self.canvas.create_image(round(ox + visible_x0), round(oy + visible_y0),
                                 anchor="nw", image=self.photo, tags="photo")
        self.canvas.tag_lower("photo")
        self._draw_overlay()
        self._update_scrollbars(iw, ih, vw, vh)

    def _update_scrollbars(self, iw, ih, vw, vh):
        if iw <= vw: self.xbar.set(0, 1)
        else: self.xbar.set(self.pan_x / iw, (self.pan_x + vw) / iw)
        if ih <= vh: self.ybar.set(0, 1)
        else: self.ybar.set(self.pan_y / ih, (self.pan_y + vh) / ih)

    def _draw_overlay(self):
        self.canvas.delete("overlay")
        if self.source is None:
            return
        ox, oy, iw, ih, _, _ = self._geometry()
        c = self._candidate if self._candidate is not None else self.crop
        if c is None:
            if self.grid_mode!="off":
                self._grid(ox,oy,ox+iw,oy+ih)
            return
        x0 = ox + c["x"] * iw
        y0 = oy + c["y"] * ih
        x1 = x0 + c["width"] * iw
        y1 = y0 + c["height"] * ih
        # Transparent stipple shades region OUTSIDE the desired crop.
        for bbox in ((ox, oy, ox+iw, y0),
                     (ox, y1, ox+iw, oy+ih),
                     (ox, y0, x0, y1),
                     (x1, y0, ox+iw, y1)):
            if bbox[2] > bbox[0] and bbox[3] > bbox[1]:
                self.canvas.create_rectangle(*bbox, fill="#080d12",
                                             stipple="gray25", outline="",
                                             tags="overlay")
        self.canvas.create_rectangle(x0, y0, x1, y1, outline="#fbf8ef",
                                     width=3, tags="overlay")
        self.canvas.create_rectangle(x0, y0, x1, y1, outline="#333333",
                                     width=1, dash=(5, 5), tags="overlay")
        self._grid(x0,y0,x1,y1)
        handles = [(x0,y0),(x1,y0),(x0,y1),(x1,y1),
                   ((x0+x1)/2,y0),((x0+x1)/2,y1),
                   (x0,(y0+y1)/2),(x1,(y0+y1)/2)]
        for x,y in handles:
            self.canvas.create_rectangle(x-5,y-5,x+5,y+5,
                                         fill="#ffffff",outline="#29363d",
                                         width=1,tags="overlay")
        if self._start is not None and self.mode == "crop":
            dims = getattr(self,"measurement_size",self.source.size)
            crop_w = max(1, round(c["width"] * dims[0]))
            crop_h = max(1, round(c["height"] * dims[1]))
            message = f"{crop_w} × {crop_h} px  |  {crop_w / crop_h:.3f}:1"
            tipx = min(max(8, x1 - 190), max(8, self.canvas.winfo_width() - 210))
            tipy = y0 - 30 if y0 >= 42 else min(y1 + 8, self.canvas.winfo_height()-30)
            self.canvas.create_rectangle(tipx,tipy,tipx+200,tipy+24,
                fill="#1e3037",outline="#ffffff",tags="overlay")
            self.canvas.create_text(tipx+100,tipy+12,text=message,
                fill="white",font=("Segoe UI",9),tags="overlay")
        if self._candidate is not None and self.mode == "horizon":
            # Horizon is rendered separately in _move_draw.
            pass

    def right_click(self,event=None):
        if self.mode!="crop":
            self.cancel_draw(event)
            return
        had_crop=self.crop is not None or self._candidate is not None or self._start is not None
        self._start=self._candidate=self._edit=None
        self.canvas.delete("guide")
        self.set_crop(None,notify=had_crop)
        if had_crop and self.status is not None:self.status.set("Crop cleared. Full photograph selected.")

    def cancel_draw(self, _event=None):
        """Cancel an in-progress crop, horizon, or vertical guide without changing image."""
        if self._start is None:
            return
        self._start=None
        self._candidate=None
        self._edit=None
        self.canvas.delete("guide")
        self._draw_overlay()
        if self.status is not None:
            try:
                self.status.set("Drawing canceled. Existing settings preserved.")
            except AttributeError:
                pass

    def _start_draw(self, event):
        if self.mode == "pan":
            self._start_pan(event)
            return
        hit = self._hit_crop(event.x,event.y) if self.mode=="crop" and self.source else None
        if not self.source or (not hit and not self._inside(event.x, event.y)):
            self._start = None
            return
        self._edit=(hit,self.point_to_image(event.x,event.y),dict(self.crop)) if hit else None
        self._start = (event.x, event.y)
        self._candidate = None
        self.canvas.delete("guide")

    def _move_draw(self, event):
        if self.mode == "pan":
            self._move_pan(event)
            return
        if self._start is None:
            return
        self.canvas.delete("guide")
        if self.mode in ("horizon","vertical"):
            self.canvas.create_line(*self._start, event.x, event.y,
                                    fill="#f9c04c", width=3, tags="guide")
            return
        if self._edit:
            kind,start,original=self._edit
            now=self.point_to_image(event.x,event.y)
            dx,dy=now[0]-start[0],now[1]-start[1]
            left,top=original["x"],original["y"]
            right,bottom=left+original["width"],top+original["height"]
            if kind=="move":
                dx=max(-left,min(dx,1-right))
                dy=max(-top,min(dy,1-bottom))
                left+=dx;right+=dx;top+=dy;bottom+=dy
            else:
                if "w" in kind:left=max(0,min(left+dx,right-MIN_CROP))
                if "e" in kind:right=min(1,max(right+dx,left+MIN_CROP))
                if "n" in kind:top=max(0,min(top+dy,bottom-MIN_CROP))
                if "s" in kind:bottom=min(1,max(bottom+dy,top+MIN_CROP))
            newbox={"x":left,"y":top,"width":right-left,"height":bottom-top}
            if self.aspect_ratio and kind!="move":
                self._candidate=self._anchored_resize(original,kind,newbox)
            else:
                self._candidate=normalize_crop(newbox)
            self._draw_overlay()
            if self.on_crop and self._candidate:
                self.on_crop(self._candidate)
            return
        a = self.point_to_image(*self._start)
        b = self.point_to_image(event.x, event.y)
        self._candidate = self._constrain_crop_ratio(crop_from_points(a, b))
        self._draw_overlay()
        if self.on_crop and self._candidate:
            self.on_crop(self._candidate)

    def _end_draw(self, event):
        if self.mode == "pan":
            self._drag_pan = None
            return
        if self._start is None:
            return
        start = self._start
        self._start = None
        if self.mode in ("horizon","vertical"):
            self.canvas.delete("guide")
            a, b = self.point_to_image(*start), self.point_to_image(event.x, event.y)
            if (self.on_vertical if self.mode=="vertical" else self.on_horizon) and math.hypot((b[0]-a[0])*self.source.width,
                                              (b[1]-a[1])*self.source.height) >= 20:
                (self.on_vertical if self.mode=="vertical" else self.on_horizon)(a, b)
            return
        if self._edit:
            self._edit=None
            crop=self._candidate
            self._candidate=None
            if crop:self.set_crop(crop,notify=True)
            return
        a, b = self.point_to_image(*start), self.point_to_image(event.x, event.y)
        crop = self._constrain_crop_ratio(crop_from_points(a, b))
        self._candidate = None
        if crop:
            self.set_crop(crop, notify=True)
        else:
            self._draw_overlay()

    def _start_pan(self, event):
        if self.source:
            self._drag_pan = (event.x, event.y, self.pan_x, self.pan_y)

    def _move_pan(self, event):
        if not self._drag_pan:
            return
        x0, y0, px, py = self._drag_pan
        self.pan_x = px - (event.x - x0)
        self.pan_y = py - (event.y - y0)
        self._schedule_render()

    def scroll_x(self, *args):
        self._scroll(0, *args)

    def scroll_y(self, *args):
        self._scroll(1, *args)

    def _scroll(self, axis, *args):
        if self.source is None:
            return
        iw, ih = self._virtual_size()
        vw, vh = self._viewport_dims()
        span, visible = (iw, vw) if axis == 0 else (ih, vh)
        value = self.pan_x if axis == 0 else self.pan_y
        if args[0] == "moveto":
            value = max(0.0, min(span-visible, float(args[1]) * span))
        elif args[0] == "scroll":
            value += int(args[1]) * (visible * .12 if args[2] == "units" else visible * .9)
        if axis == 0: self.pan_x = value
        else: self.pan_y = value
        self._schedule_render()

    def _wheel_zoom(self, event):
        self.set_zoom(self.zoom + (0.25 if event.delta > 0 else -0.25))
        return "break"

    def _wheel_pan(self, event):
        self._scroll(1, "scroll", -1 if event.delta > 0 else 1, "units")
        return "break"

    def _unix_wheel(self, event, direction):
        self._scroll(1, "scroll", direction, "units")
        return "break"
