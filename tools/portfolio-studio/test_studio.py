"""Offline regression checks. Uses temporary synthetic images; never saves the real catalog.

Run: python -m unittest discover -s tools/portfolio-studio -p test_studio.py -v
"""
import copy
import hashlib
import json
import io
from pathlib import Path
import tempfile
import tkinter as tk
from types import SimpleNamespace
import unittest
from unittest.mock import patch, Mock

from PIL import Image, ImageChops, ImageStat
import processor
import photo_studio
import edit_tags
import manage_published
import window_state
import publication_metadata
import update_published_authors
import recycle_bin
import gallery_thumbnails
import export_rights
import studio_about
import studio_info
import update_published_rights
import arrange_gallery
import offline_descriptions
import studio_notifications
from xml.etree import ElementTree
from photo_viewport import PhotoViewport, normalize_crop


class OfflineDescriptionTests(unittest.TestCase):
    def test_specific_model_categories_are_reduced_to_generic_nouns(self):
        self.assertEqual(offline_descriptions.generic_class(151,"Chihuahua"),"Dog")
        self.assertEqual(offline_descriptions.generic_class(281,"tabby cat"),"Cat")
        self.assertEqual(offline_descriptions.generic_class(970,"alp"),"Mountains")
        self.assertEqual(offline_descriptions.generic_class(663,"monastery"),"Religious building")

    def test_missing_model_uses_image_content_and_composition_without_network(self):
        with patch.object(offline_descriptions,"_network",None), \
                patch.object(offline_descriptions,"model_ready",return_value=False), \
                patch("socket.create_connection",side_effect=AssertionError("Network forbidden")):
            self.assertEqual(offline_descriptions.describe(Image.new("RGB",(700,400),"black")),"Dark scene")
            self.assertEqual(offline_descriptions.describe(Image.new("RGB",(400,700),"white")),"Vertical composition")

    def test_installed_model_runs_offline_and_outputs_at_most_three_words(self):
        if not offline_descriptions.model_ready():self.skipTest("Local model not installed")
        with patch("socket.create_connection",side_effect=AssertionError("Network forbidden")):
            label=offline_descriptions.describe(Image.new("RGB",(600,400),(120,160,200)))
        self.assertLessEqual(len(label.split()),3)
        self.assertNotEqual(label,"Photograph")


class WatermarkTests(unittest.TestCase):
    def test_auto_level_uses_horizontal_and_vertical_references(self):
        from PIL import ImageDraw
        for vertical in (False,True):
            image=Image.new("RGB",(1000,800),"white");draw=ImageDraw.Draw(image)
            if vertical:
                for x in (150,350,600,850):draw.line((x,70,x,730),fill="black",width=5)
            else:
                for y in (150,300,500,650):draw.line((80,y,920,y),fill="black",width=5)
            tilted=image.rotate(-2.5,resample=Image.Resampling.BICUBIC,fillcolor="white")
            correction=processor.conservative_level(tilted)
            self.assertIsNotNone(correction)
            self.assertAlmostEqual(correction,2.5,delta=.3)
        self.assertIsNone(processor.conservative_level(Image.new("RGB",(700,450),"gray")))

    def test_bright_sky_tiles_remain_faint_with_and_without_fine_texture(self):
        sky=Image.new("RGB",(1080,720),(245,245,245))
        result=processor.watermark(sky,corner_alpha=0)
        peak=max(high for low,high in ImageChops.difference(sky,result).getextrema())
        self.assertLessEqual(peak,4)
        sky.putdata([(235,240,245) if (x//3+y//3)%2 else (245,250,255)
            for y in range(720) for x in range(1080)])
        result=processor.watermark(sky,corner_alpha=0)
        peak=max(high for low,high in ImageChops.difference(sky,result).getextrema())
        self.assertLessEqual(peak,10)

    def test_dark_multicolor_texture_gets_stronger_tiles_and_corner(self):
        image=Image.new("RGB",(1080,720))
        image.putdata([(15,45,80) if (x//3+y//3)%2 else (80,20,35)
            for y in range(720) for x in range(1080)])
        tiles=processor.watermark(image,corner_alpha=0)
        corner=processor.watermark(image,tile_alpha=0)
        def peak(result):return max(high for low,high in ImageChops.difference(image,result).getextrema())
        self.assertGreaterEqual(peak(tiles),22)
        self.assertGreaterEqual(peak(corner),30)
        self.assertLessEqual(peak(corner),65)

    def test_detailed_background_gets_restrained_watermark_boost(self):
        textured=Image.new("L",(1080,720))
        textured.putdata([70 if (x//3+y//3)%2 else 130 for y in range(720) for x in range(1080)])
        source=textured.convert("RGB")
        result=processor.watermark(source,corner_alpha=0)
        difference=ImageChops.difference(source,result)
        peak=max(high for low,high in difference.getextrema())
        smooth=Image.new("RGB",source.size,(100,100,100))
        smooth_result=processor.watermark(smooth,corner_alpha=0)
        smooth_peak=max(high for low,high in ImageChops.difference(smooth,smooth_result).getextrema())
        self.assertGreater(peak,smooth_peak)
        self.assertGreaterEqual(peak,16)
        self.assertLessEqual(peak,35)

    def test_tiles_cover_lower_crowd_region_without_corner_watermark(self):
        image=Image.new("RGB",(1080,720),(90,100,110))
        result=processor.watermark(image,corner_alpha=0)
        lower=ImageChops.difference(image,result).crop((0,600,800,710))
        self.assertIsNotNone(lower.getbbox())

    def test_preview_encoder_and_publishing_produce_identical_jpeg(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/"original.png";destination=Path(folder)/"export.jpg"
            Image.new("RGB",(1200,800),(30,60,90)).save(source)
            before=source.read_bytes()
            arguments={"max_side":720,"degrees":2.5,"quality":85,
                "export_crop":{"x":.1,"y":.1,"width":.7,"height":.6}}
            preview,dimensions=processor.encode_publication(source,**arguments)
            published=processor.publish_image(source,destination,**arguments)
            self.assertEqual(preview,destination.read_bytes())
            self.assertEqual(dimensions,published)
            self.assertEqual(source.read_bytes(),before)

    def test_tiles_stay_subtle_in_deep_shadows_and_sky(self):
        peaks=[]
        for value in (0,50,100):
            source=Image.new("RGB",(1080,720),(value,)*3)
            result=processor.watermark(source,corner_alpha=0)
            peaks.append(max(high for low,high in ImageChops.difference(source,result).getextrema()))
            if value==0:
                stream=io.BytesIO();result.save(stream,format="JPEG",quality=90,subsampling=0)
                stream.seek(0)
                jpeg_peak=Image.open(stream).convert("L").getextrema()[1]
                self.assertGreaterEqual(jpeg_peak,7)
                self.assertLessEqual(jpeg_peak,15)
        self.assertGreaterEqual(peaks[0],8)
        self.assertLessEqual(peaks[0],12)
        self.assertLessEqual(peaks[1],6)
        self.assertLessEqual(peaks[2],4)

    def test_tiles_select_tone_under_each_lettering_pixel(self):
        source=Image.new("L",(1080,720),0)
        source.paste(220,(450,0,1080,720))
        result=processor.watermark(source.convert("RGB"),corner_alpha=0).convert("L")
        dark_changed=light_changed=False
        for before,after in zip(source.tobytes(),result.tobytes()):
            if before==0:
                self.assertGreaterEqual(after,before)
                dark_changed=dark_changed or after>before
            else:
                # The opposing one-pixel edge can lift a bright pixel slightly;
                # the lettering itself still darkens this bright background.
                self.assertLessEqual(after,before+2)
                light_changed=light_changed or after<before
        self.assertTrue(dark_changed and light_changed)

    def test_contrast_is_subtle_on_dark_and_light_backgrounds(self):
        for color in (0, 12, 70, 127, 180, 245, 255):
            with self.subTest(color=color):
                source=Image.new("RGB",(1080,720),(color,)*3)
                result=processor.watermark(source,tile_alpha=0)
                difference=ImageChops.difference(source,result)
                peak=max(hi for lo,hi in difference.getextrema())
                self.assertGreater(peak,5)
                self.assertLessEqual(peak,30)
                # Only the signature area changes when tiles are disabled.
                bounds=difference.getbbox()
                self.assertGreater(bounds[0],600)
                self.assertGreater(bounds[1],600)
                self.assertEqual(source.getpixel((1000,690)),(color,)*3)

    def test_corner_does_not_change_tiled_watermarks(self):
        source=Image.new("RGB",(1080,720),(30,80,140))
        with_corner=processor.watermark(source)
        tiles_only=processor.watermark(source,corner_alpha=0)
        self.assertEqual(with_corner.crop((0,0,1080,600)).tobytes(),tiles_only.crop((0,0,1080,600)).tobytes())

    def test_export_preserves_source_and_rejects_overwrites(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/"source.png"; target=Path(folder)/"export.jpg"
            Image.new("RGB",(1200,800),(15,30,60)).save(source)
            before=hashlib.sha256(source.read_bytes()).hexdigest()
            dimensions=processor.publish_image(source,target,max_side=720,degrees=2)
            self.assertEqual(max(dimensions["width"],dimensions["height"]),720)
            self.assertEqual(before,hashlib.sha256(source.read_bytes()).hexdigest())
            with self.assertRaises(FileExistsError):processor.publish_image(source,target)
            with self.assertRaises(ValueError):processor.publish_image(source,source)

    def test_rotation_measurement_matches_pixels(self):
        image=Image.new("RGB",(1200,800))
        for angle in (0, -3, 15, 35):
            self.assertEqual(processor.rotation_crop_size(*image.size,angle),processor.straighten_and_crop(image,angle).size)


class ExportRightsTests(unittest.TestCase):
    def test_lossless_backfill_is_idempotent_and_retains_other_properties(self):
        exif=Image.Exif();exif[270]="Existing description"
        buffer=io.BytesIO();Image.new("RGB",(80,50),(90,70,20)).save(buffer,"JPEG",exif=exif)
        before=buffer.getvalue();after=export_rights.set_jpeg_rights(before)
        self.assertEqual(export_rights.without_rights_metadata(before),export_rights.without_rights_metadata(after))
        self.assertEqual(export_rights.set_jpeg_rights(after),after)
        with Image.open(io.BytesIO(after)) as image:
            self.assertEqual(image.getexif()[270],"Existing description")
            self.assertIn(export_rights.NOTICE.encode(),image.info["xmp"])
        # Existing XMP fields survive the rights-property merge.
        xmp=b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Retain this title</dc:title></rdf:Description></rdf:RDF></x:xmpmeta>'
        payload=export_rights.XMP_HEADER+xmp
        with_xmp=before[:2]+b'\xff\xe1'+(len(payload)+2).to_bytes(2,'big')+payload+before[2:]
        merged=export_rights.set_jpeg_rights(with_xmp)
        with Image.open(io.BytesIO(merged)) as image:
            self.assertIn(b'Retain this title',image.info['xmp'])
        self.assertEqual(export_rights.set_jpeg_rights(merged),merged)

    def test_backfill_restores_missing_xmp_even_when_exif_is_current(self):
        buffer=io.BytesIO();Image.new("RGB",(70,40)).save(buffer,"JPEG",exif=export_rights.export_exif())
        updated=export_rights.set_jpeg_rights(buffer.getvalue())
        with Image.open(io.BytesIO(updated)) as image:self.assertIn("xmp",image.info)

    def test_bulk_rights_backfill_dry_run_backup_and_private_hash(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);media=root/'photography'/'published';media.mkdir(parents=True)
            stream=io.BytesIO();Image.new('RGB',(90,60)).save(stream,'JPEG')
            original=stream.getvalue();target=media/'photo.jpg';target.write_bytes(original)
            private=root/'registry.json';key=str(root.resolve()).casefold()
            private.write_text(json.dumps({key:{'photo.jpg':{'publishedHash':hashlib.sha256(original).hexdigest()}}}))
            with patch.object(update_published_rights,'registry_path',return_value=private):
                self.assertEqual(update_published_rights.update(root),1)
                self.assertEqual(target.read_bytes(),original)
                self.assertEqual(update_published_rights.update(root,apply=True,backup_dir=root/'backups'),1)
                self.assertEqual(next((root/'backups').rglob('photo.jpg')).read_bytes(),original)
                self.assertEqual(json.loads(private.read_text())[key]['photo.jpg']['publishedHash'],hashlib.sha256(target.read_bytes()).hexdigest())
                self.assertEqual(update_published_rights.update(root),0)

    def test_both_derivatives_embed_rights_without_changing_original(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/"original.jpg"
            old=Image.Exif();old[271]="Private camera";old[306]="2001:02:03 04:05:06"
            old[37510]=b"ASCII\0\0\0Private source comment"
            Image.new("RGB",(900,600),(20,70,120)).save(source,exif=old)
            before=source.read_bytes()
            full,thumb,_=processor.encode_publication_pair(source)
            self.assertEqual(source.read_bytes(),before)
            for data in (full,thumb):
                with Image.open(io.BytesIO(data)) as image:
                    exif=image.getexif()
                    self.assertEqual(exif[315],studio_info.AUTHOR)
                    self.assertEqual(exif[305],f"Portfolio Studio {studio_info.VERSION}")
                    self.assertEqual(exif[37510],b"ASCII\0\0\0"+export_rights.NOTICE.encode("ascii"))
                    self.assertNotIn(271,exif);self.assertNotIn(306,exif);self.assertNotIn(34853,exif)
                    xmp=image.info["xmp"]
                    tree=ElementTree.fromstring(xmp)
                    mining=tree.find(".//{http://ns.useplus.org/ldf/xmp/1.0/}DataMining")
                    self.assertEqual(mining.attrib["{http://www.w3.org/1999/02/22-rdf-syntax-ns#}resource"],export_rights.DATA_MINING)
                    self.assertIn(export_rights.NOTICE.encode(),xmp)
                    self.assertNotIn(b"Private",xmp)

    def test_xmp_attachment_does_not_recompress_or_alter_pixels(self):
        plain=io.BytesIO();Image.new("RGB",(70,45),(120,55,70)).save(plain,format="JPEG")
        before=plain.getvalue();after=export_rights.jpeg_with_rights(before)
        block_length=2+int.from_bytes(after[4:6],"big")
        self.assertEqual(after[:2]+after[2+block_length:],before)
        with Image.open(io.BytesIO(before)) as a,Image.open(io.BytesIO(after)) as b:
            self.assertEqual(a.tobytes(),b.tobytes())
        self.assertEqual(after.count(export_rights.XMP_HEADER),1)
        self.assertLess(len(after)-len(before),2048)


class AuthorshipTests(unittest.TestCase):
    def jpeg(self):
        exif=Image.Exif();exif[271]="Existing camera";exif[315]="Old author"
        buffer=io.BytesIO()
        Image.new("RGB",(600,400),(40,70,100)).save(buffer,format="JPEG",exif=exif,progressive=True)
        return buffer.getvalue()

    def test_metadata_update_preserves_image_data_and_other_metadata(self):
        before=self.jpeg();after=publication_metadata.set_authorship(before)
        self.assertEqual(publication_metadata.without_exif(before),publication_metadata.without_exif(after))
        with Image.open(io.BytesIO(after)) as image:
            exif=image.getexif()
            self.assertEqual(exif[315],"Brandon J. Chen")
            self.assertEqual(bytes(exif[40093]).decode("utf-16le").rstrip("\0"),"Brandon J. Chen")
            self.assertEqual(exif[271],"Existing camera")
            self.assertEqual(exif[33432],publication_metadata.COPYRIGHT)
        self.assertEqual(publication_metadata.set_authorship(after),after)

    def test_exports_get_authorship_without_source_metadata(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/"source.jpg";source.write_bytes(self.jpeg())
            destination=Path(folder)/"published.jpg"
            processor.publish_image(source,destination,max_side=600)
            with Image.open(destination) as image:
                self.assertEqual(image.getexif()[315],publication_metadata.AUTHOR)
                self.assertIn(40093,image.getexif())
                self.assertNotIn(271,image.getexif())
                self.assertEqual(image.getexif()[33432],publication_metadata.COPYRIGHT)

    def test_bulk_update_dry_run_backup_and_repeat(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);media=root/"photography"/"published";media.mkdir(parents=True)
            target=media/"photo.jpg";before=self.jpeg();target.write_bytes(before)
            self.assertEqual(update_published_authors.update(root),1)
            self.assertEqual(target.read_bytes(),before)
            self.assertEqual(update_published_authors.update(root,apply=True),1)
            self.assertEqual(next((root/"_old").rglob("photo.jpg")).read_bytes(),before)
            self.assertEqual(update_published_authors.update(root),0)


class GalleryThumbnailTests(unittest.TestCase):
    def setUp(self):
        folder=tempfile.TemporaryDirectory();self.addCleanup(folder.cleanup)
        self.root=Path(folder.name)/"site";self.source=Path(folder.name)/"source.png"
        patcher=patch.object(gallery_thumbnails,"registry_path",return_value=Path(folder.name)/"private"/"sources.json")
        patcher.start();self.addCleanup(patcher.stop)
        Image.new("RGB",(1200,800),(70,90,110)).save(self.source)

    def test_pair_has_only_corner_on_gallery_and_both_on_full_export(self):
        before=self.source.read_bytes()
        full,thumbnail,size=processor.encode_publication_pair(self.source)
        clean=processor.prepare_publication(self.source)
        expected,_=processor.encode_gallery_thumbnail(clean)
        self.assertEqual(thumbnail,expected)
        self.assertEqual(full,processor.encode_publication(self.source)[0])
        with Image.open(io.BytesIO(thumbnail)) as image:
            self.assertEqual(image.format,"WEBP");self.assertLessEqual(max(image.size),800)
            self.assertEqual(image.getexif()[315],publication_metadata.AUTHOR)
        self.assertEqual(self.source.read_bytes(),before)

    def test_gallery_crop_is_baked_before_corner_watermark(self):
        crop={"x":.2,"y":.1,"width":.5,"height":.6}
        full,thumbnail,size=processor.encode_publication_pair(self.source,gallery_crop=crop)
        with Image.open(io.BytesIO(thumbnail)) as image:
            self.assertAlmostEqual(image.width/image.height,1200*.5/(800*.6),places=2)
        self.assertEqual(full,processor.encode_publication(self.source)[0])

    def test_reusable_builder_skips_unchanged_and_keeps_sources_private(self):
        media=self.root/"photography"/"published";media.mkdir(parents=True)
        full=processor.encode_publication(self.source)[0];(media/"source.jpg").write_bytes(full)
        photo={"file":"source.jpg","alt":"Synthetic photograph","aspectRatio":1.5,"tags":[]}
        catalog={"schemaVersion":1,"photoTags":[],"photos":[photo]}
        data=self.root/"data"/"media-catalog.json";data.parent.mkdir();data.write_text(json.dumps(catalog))
        js=self.root/"js"/"photography-catalog.js";js.parent.mkdir();js.write_text(photo_studio.generated_js(catalog))
        settings=photo_studio.new_settings(self.source)
        gallery_thumbnails.save_registry(self.root,{"source.jpg":gallery_thumbnails.source_record(self.source,settings,full)})
        first=gallery_thumbnails.build_thumbnails(self.root,apply=True)
        self.assertEqual(first["updated"],["source.jpg"]);self.assertFalse(first["errors"])
        second=gallery_thumbnails.build_thumbnails(self.root,apply=True)
        self.assertEqual(second["skipped"],["source.jpg"])
        self.assertEqual(len(list((self.root/"photography"/"thumbnails").glob("*.webp"))),1)
        self.assertNotIn(str(self.source),data.read_text())
        self.assertNotIn(str(self.source),js.read_text())


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.media=self.root/"photography"/"published";self.media.mkdir(parents=True)
        self.catalog_path=self.root/"catalog.json";self.runtime=self.root/"catalog.js"
        self.source=self.root/"source.png"
        Image.new("RGB",(600,400),(20,40,60)).save(self.source)
        self.dest=self.media/"source_edit.jpg"
        Image.new("RGB",(600,400),(150,120,90)).save(self.dest)
        self.catalog={"schemaVersion":1,"photoTags":[],"photos":[
            {"file":self.dest.name,"alt":"Old description","aspectRatio":1.5,"tags":[],"galleryCrop":
             {"x":.1,"y":.1,"width":.5,"height":.5}}]}
        self.catalog_path.write_text(json.dumps(self.catalog),encoding="utf-8")
        self.runtime.write_text(photo_studio.generated_js(self.catalog),encoding="utf-8")
        self.before={p:p.read_bytes() for p in (self.dest,self.catalog_path,self.runtime,self.source)}
        variable=lambda value:SimpleNamespace(get=lambda:value)
        settings=photo_studio.new_settings(self.source)
        settings.update(alt="New description",altReviewed=True)
        self.studio=SimpleNamespace(files=[self.source],current=self.source,
            settings={str(self.source):settings},save_current=lambda:None,
            publish_scope=variable("current"),filename_suffix=variable("_edit"),
            jpeg_quality=variable("90"),open_after_publish=variable(True),status=Mock())
        self.addCleanup(patch.stopall)
        patch.object(gallery_thumbnails,"registry_path",return_value=self.root/"private-sources.json").start()
        patch.multiple(photo_studio,ROOT=self.root,PHOTO_DIR=self.media,CATALOG=self.catalog_path,
            RUNTIME=self.runtime,LOGO=None).start()
        self.question=patch.object(photo_studio.messagebox,"askyesnocancel",return_value=True).start()
        self.confirm=patch.object(photo_studio.messagebox,"askyesno",return_value=True).start()
        self.errors=patch.object(photo_studio.messagebox,"showerror").start()
        patch.object(photo_studio,"notify").start()
        self.viewer=patch.object(photo_studio,"open_path").start()

    def publish(self):photo_studio.Studio.publish(self.studio)

    def assert_unchanged(self):
        for path,content in self.before.items():self.assertEqual(path.read_bytes(),content)

    def test_overwrite_updates_existing_entry_without_duplicates(self):
        self.publish();self.errors.assert_not_called()
        self.assertNotEqual(self.dest.read_bytes(),self.before[self.dest])
        catalog=json.loads(self.catalog_path.read_text())
        self.assertEqual(len(catalog["photos"]),1)
        self.assertEqual(catalog["photos"][0]["alt"],"New description")
        self.assertNotIn("galleryCrop",catalog["photos"][0])
        self.assertEqual(self.source.read_bytes(),self.before[self.source])
        self.viewer.assert_called_once_with(str(self.dest.resolve()))
        entry=catalog["photos"][0]
        self.assertTrue((self.root/"photography"/"thumbnails"/entry["thumbnail"]).is_file())

    def test_numbered_copy_preserves_existing_photo(self):
        self.question.return_value=False
        self.publish();self.errors.assert_not_called()
        self.assertTrue((self.media/"source_edit_2.jpg").is_file())
        self.assertEqual(self.dest.read_bytes(),self.before[self.dest])
        self.assertEqual(len(json.loads(self.catalog_path.read_text())["photos"]),2)

    def test_repeated_overwrite_reuses_single_thumbnail(self):
        self.publish();self.publish();self.errors.assert_not_called()
        self.assertEqual(len(list((self.root/"photography"/"thumbnails").glob("*.webp"))),1)
        self.assertEqual(len(json.loads(self.catalog_path.read_text())["photos"]),1)

    def test_one_confirmation_includes_selection_and_crop_settings(self):
        self.studio.settings[str(self.source)].update(cropApplied=True,
            galleryCrop={"x":.1,"y":.1,"width":.5,"height":.5})
        self.publish();self.errors.assert_not_called()
        self.confirm.assert_called_once()
        title,message=self.confirm.call_args.args
        self.assertEqual(title,"Confirm publishing")
        for text in ("source_edit.jpg","Crop exported JPEG","1080 px","JPEG quality: 90","overwrite"):
            self.assertIn(text,message)

    def test_declining_combined_confirmation_changes_nothing(self):
        self.confirm.return_value=False
        self.publish();self.assert_unchanged();self.viewer.assert_not_called()

    def test_cancel_changes_nothing(self):
        self.question.return_value=None
        self.publish();self.assert_unchanged();self.errors.assert_not_called()
        self.viewer.assert_not_called()

    def test_failed_export_preserves_existing_photo_and_catalog(self):
        with patch.object(photo_studio,"publish_image",side_effect=OSError("encoding failed")):
            self.publish()
        self.errors.assert_called_once();self.assert_unchanged()
        self.viewer.assert_not_called()

    def test_viewer_failure_does_not_undo_successful_publication(self):
        self.viewer.side_effect=OSError("No associated viewer")
        self.publish();self.errors.assert_not_called()
        self.assertNotEqual(self.dest.read_bytes(),self.before[self.dest])
        self.assertEqual(json.loads(self.catalog_path.read_text())["photos"][0]["alt"],"New description")
        photo_studio.notify.assert_called_once()

    def test_viewer_can_be_disabled_after_publishing(self):
        self.studio.open_after_publish=SimpleNamespace(get=lambda:False)
        self.publish();self.errors.assert_not_called();self.viewer.assert_not_called()
        self.assertEqual(json.loads(self.catalog_path.read_text())["photos"][0]["alt"],"New description")

    def test_failed_metadata_commit_restores_overwritten_photo(self):
        replace=photo_studio.os.replace
        failed=False
        def fail_once(source,destination):
            nonlocal failed
            if Path(destination)==self.runtime and not failed:
                failed=True;raise OSError("metadata commit failed")
            return replace(source,destination)
        with patch.object(photo_studio.os,"replace",side_effect=fail_once):self.publish()
        self.errors.assert_called_once();self.assert_unchanged()
        self.assertFalse(list((self.root/"photography"/"thumbnails").glob("*.webp")))


class WindowMemoryTests(unittest.TestCase):
    def test_auto_open_preference_preserves_maximum_size(self):
        path=self.path.with_name("preferences.json")
        photo_studio.save_preferences({"maxSide":1440,"openAfterPublish":False},path)
        photo_studio.save_preferences({"maxSide":720},path)
        self.assertEqual(photo_studio.load_preferences(path),{"maxSide":720,"openAfterPublish":False})
        photo_studio.save_preferences({"openAfterPublish":True},path)
        self.assertEqual(photo_studio.load_preferences(path),{"maxSide":720,"openAfterPublish":True})

    def setUp(self):
        folder=tempfile.TemporaryDirectory();self.addCleanup(folder.cleanup)
        self.path=Path(folder.name)/"window-state.json"
        patcher=patch.object(window_state,"window_state_path",return_value=self.path)
        patcher.start();self.addCleanup(patcher.stop)

    def window(self):
        window=Mock()
        window.state.return_value="normal"
        window.winfo_screenwidth.return_value=1920
        window.winfo_screenheight.return_value=1080
        window.winfo_width.return_value=1200
        window.winfo_height.return_value=800
        window.winfo_ismapped.return_value=True
        window.geometry.return_value="1200x800+20+20"
        return window

    def test_normal_size_round_trip_and_independent_windows(self):
        window=self.window();memory=window_state.WindowMemory(window,"main")
        event=SimpleNamespace(widget=window)
        memory.capture(event);memory.closed(event)
        window_state.save_state("catalog",{"width":1000,"height":700,"maximized":False})
        next_window=self.window();window_state.WindowMemory(next_window,"main")
        next_window.geometry.assert_called_once_with("1200x800")
        self.assertIn("catalog",window_state.read_states())

    def test_maximized_round_trip_preserves_restore_size_when_minimized(self):
        window=self.window();memory=window_state.WindowMemory(window,"main")
        event=SimpleNamespace(widget=window)
        memory.capture(event)
        window.state.return_value="zoomed";memory.capture(event)
        window.state.return_value="iconic";memory.capture(event);memory.closed(event)
        self.assertEqual(window_state.read_states()["main"],{"width":1200,"height":800,"maximized":True})
        next_window=self.window();restored=window_state.WindowMemory(next_window,"main")
        next_window.geometry.assert_called_once_with("1200x800")
        restored.restore_maximized();next_window.state.assert_called_with("zoomed")

    def test_invalid_preferences_are_ignored_and_large_sizes_fit_screen(self):
        self.path.write_text("broken json")
        window=self.window();window_state.WindowMemory(window,"main")
        window.geometry.assert_not_called()
        window_state.save_state("main",{"width":5000,"height":2000,"maximized":False})
        restored=self.window();window_state.WindowMemory(restored,"main")
        restored.geometry.assert_called_once_with("1880x1000")


class WindowTests(unittest.TestCase):
    def setUp(self):
        self.errors=[]
        self.old_init=tk.Tk.__init__
        def hidden_init(window,*args,**kwargs):
            self.old_init(window,*args,**kwargs)
            window.withdraw()
            window.report_callback_exception=lambda *exc:self.errors.append(exc)
        self.hide=patch.object(tk.Tk,"__init__",hidden_init);self.hide.start()
        self.windows=[]
        self.temp=tempfile.TemporaryDirectory()
        source_path=patch.object(gallery_thumbnails,"registry_path",return_value=Path(self.temp.name)/"private-sources.json")
        source_path.start();self.addCleanup(source_path.stop)
        state_path=patch.object(window_state,"window_state_path",return_value=Path(self.temp.name)/"windows.json")
        state_path.start();self.addCleanup(state_path.stop)
        self.path=Path(self.temp.name)/"source.png"
        Image.new("RGB",(1200,800),(30,60,90)).save(self.path)

    def tearDown(self):
        for window in self.windows:
            window.update_idletasks()
            window.destroy()
        self.hide.stop();self.temp.cleanup()
        self.assertFalse(self.errors,self.errors)

    def studio(self):
        studio=photo_studio.Studio();self.windows.append(studio)
        studio.files=[self.path]
        studio.settings[str(self.path)]=photo_studio.new_settings(self.path)
        studio.files_list.insert("end",self.path.name)
        studio.files_list.selection_set(0)
        studio.load_current(0)
        studio.update_idletasks()
        return studio

    def test_manual_and_generated_description_review(self):
        studio=self.studio()
        studio.alt_var.set("A manually typed description.")
        self.assertTrue(studio.review_var.get())
        studio.review_var.set(False)
        studio.save_current();studio.load_current(0)
        self.assertFalse(studio.review_var.get())
        studio.alt_var.set("")
        self.assertFalse(studio.review_var.get())
        studio.set_suggested_description("A generated description.")
        self.assertFalse(studio.review_var.get())

    def test_about_is_accessible_from_toolbar_and_reuses_window(self):
        studio=self.studio()
        studio.about_button.invoke();studio.update_idletasks()
        about=studio._about_window
        self.assertEqual(about.title(),"About Portfolio Studio")
        self.assertIs(studio_about.show_about(studio),about)
        notebook=next(child for child in about.winfo_children() if isinstance(child,photo_studio.ttk.Notebook))
        self.assertEqual([notebook.tab(tab,"text") for tab in notebook.tabs()],
                         ["Overview","Photo export","Rights & privacy","Components"])
        self.assertIn(studio_info.AUTHOR,studio_about.product_details())
        for tab in notebook.tabs():
            notebook.select(tab);studio.update_idletasks()
        about.destroy()
        studio.alt_var.set("An edited generated description.")
        self.assertTrue(studio.review_var.get())

    def test_export_crop_is_default_and_gallery_choice_is_preserved(self):
        studio=self.studio()
        self.assertEqual(studio.crop_action.get(),"export")
        self.assertEqual(photo_studio.new_settings(self.path)["cropAction"],"export")
        studio.crop_action.set("gallery")
        studio.crop_changed({"x":.1,"y":.1,"width":.5,"height":.5})
        studio.save_current();studio.load_current(0)
        self.assertEqual(studio.crop_action.get(),"gallery")

    def test_drawn_crop_is_saved_without_apply_and_survives_switching(self):
        studio=self.studio()
        crop={"x":.1,"y":.2,"width":.6,"height":.5}
        studio.crop_changed(crop)
        self.assertTrue(studio.settings[str(self.path)]["cropApplied"])
        studio.save_current();studio.load_current(0)
        self.assertEqual(studio.crop_rect,crop)
        studio.full_crop();studio.save_current()
        self.assertIsNone(studio.settings[str(self.path)]["galleryCrop"])
        self.assertFalse(hasattr(studio,"apply_crop_button"))

    def test_original_ratio_tracks_current_oriented_photo(self):
        studio=self.studio()
        portrait=Path(self.temp.name)/"portrait.jpg"
        exif=Image.Exif();exif[274]=6
        Image.new("RGB",(900,600)).save(portrait,exif=exif)
        studio.files.append(portrait);studio.settings[str(portrait)]=photo_studio.new_settings(portrait)
        studio.ratio_var.set("Original")
        self.assertAlmostEqual(studio.viewport.aspect_ratio,1.5)
        studio.crop_changed({"x":.1,"y":.1,"width":.6,"height":.6});studio.save_current()
        studio.load_current(1)
        self.assertAlmostEqual(studio.viewport.aspect_ratio,2/3)
        self.assertIsNone(studio.viewport.crop)
        studio.load_current(0)
        self.assertAlmostEqual(studio.viewport.aspect_ratio,1.5)
        self.assertIsNotNone(studio.viewport.crop)

    def test_generic_autofill_omits_proper_names_and_manual_text_survives(self):
        studio=self.studio()
        self.assertNotEqual(studio.alt_var.get(),"Photograph")
        self.assertLessEqual(len(studio.alt_var.get().split()),3)
        with patch.object(photo_studio,"read_json",return_value={"photos":[{"file":"source_crop.jpg","alt":"A temple in Kyoto Japan"}]}):
            self.assertEqual(studio.automatic_description(self.path),"Temple")
        for text in ("Kyoto temple at dusk", "Tokyo skyline", "Brandon Chen", "Niagara waterfalls"):
            label=photo_studio.generic_description(known_description=text)
            self.assertLessEqual(len(label.split()),3)
            self.assertNotIn(label.lower(),("kyoto","tokyo","brandon","niagara"))
        studio.alt_var.set("My manually written description.");studio.save_current();studio.load_current(0)
        self.assertEqual(studio.alt_var.get(),"My manually written description.")

    def test_heic_original_picker_preview_and_export(self):
        import pillow_heif
        heic=Path(self.temp.name)/"photo.HEIC"
        Image.new("RGB",(640,480),(70,120,170)).save(heic,format="HEIF")
        original=heic.read_bytes();studio=photo_studio.Studio();self.windows.append(studio)
        with patch.object(photo_studio.filedialog,"askopenfilenames",return_value=(str(heic),)) as picker:
            studio.choose()
        self.assertIn("*.heic",picker.call_args.kwargs["filetypes"][0][1])
        self.assertEqual(studio.viewport.source.size,(640,480))
        data,_=processor.encode_publication(heic)
        with Image.open(io.BytesIO(data)) as image:self.assertEqual(image.size,(640,480))
        self.assertEqual(heic.read_bytes(),original)

    def test_settings_and_about_are_adjacent_and_about_has_no_deferred_features(self):
        studio=self.studio()
        self.assertEqual(studio.settings_button.cget("text"),"Settings")
        labels=[label for label,button,command in studio.action_buttons]
        self.assertEqual(labels[7:],["Reset all","Settings","About"])
        self.assertEqual(studio.settings_button.master,studio.toolbar_action)
        content=" ".join(title+body for title,body in studio_about.PROTECTION_SECTIONS)
        self.assertNotIn("Pixel poisoning",content)
        self.assertNotIn("Mist",content)

    def test_export_preview_includes_watermarks_and_publishes_nothing(self):
        studio=self.studio();studio.max_var.set("720")
        studio.crop_changed({"x":.1,"y":.1,"width":.5,"height":.5})
        before=set(Path(self.temp.name).rglob("*"))
        original=tk.Toplevel.__init__
        def hidden(window,*args,**kwargs):
            original(window,*args,**kwargs);window.withdraw()
        with patch.object(tk.Toplevel,"__init__",hidden):preview=studio.preview_export()
        try:
            self.assertIsNotNone(preview._encoded_jpeg)
            with Image.open(io.BytesIO(preview._encoded_jpeg)) as image:
                self.assertEqual(image.size,(600,400))
                self.assertEqual(image.getexif()[315],publication_metadata.AUTHOR)
                self.assertGreater(max(high-low for low,high in image.getextrema()),0)
            self.assertEqual(before,set(Path(self.temp.name).rglob("*")))
            buttons=studio.publish_group.winfo_children()
            publish=next(button for button in buttons if isinstance(button,photo_studio.ttk.Button)
                and button.cget("text")=="Publish copies...")
            self.assertEqual(buttons.index(studio.export_preview_button)+1,buttons.index(publish))
        finally:preview.destroy()

    def test_catalog_action_rows_have_aligned_left_edges_and_smaller_gap(self):
        editor,media,data=self.isolated_editor()
        self.assertEqual(tuple(str(v) for v in editor.management_toolbar.cget("padding")),("10","4","10","2"))
        self.assertEqual(tuple(str(v) for v in editor.catalog_actions_bar.cget("padding")),("10","5","10","8"))
        arrange=next(child for child in editor.catalog_actions_bar.winfo_children()
            if isinstance(child,photo_studio.ttk.Button) and child.cget("text")=="Arrange gallery...")
        self.assertEqual(tuple(map(str,arrange.tk.splitlist(arrange.pack_info()["padx"]))),("3","6"))
        labels=[child.cget("text") for child in editor.catalog_actions_bar.winfo_children() if isinstance(child,photo_studio.ttk.Button)]
        self.assertFalse(any("Notification" in label for label in labels))

    def test_catalog_thumbnails_cover_published_unlisted_and_missing_rows(self):
        editor,media,data=self.isolated_editor(missing=True)
        # Run the deferred thumbnail batches without requiring any row clicks.
        for _ in range(4):editor.update()
        table=editor.listbox
        self.assertEqual(len(table.rows),len(editor.photo_rows))
        self.assertEqual(len(table.images),len(editor.photo_rows))
        for item in table.rows:self.assertTrue(table.tree.item(item,"image"))
        editor.listbox.selection_clear(0,"end")
        editor.listbox.selection_set(0,1)
        self.assertEqual(editor.listbox.curselection(),(0,1))
        controls=[label for _,label,_,_ in editor.management_toolbar.groups]
        self.assertIn("Add to gallery…",controls)
        self.assertIn("Remove from repository…",controls)

    def test_reverse_generated_suggestion_preserves_locked_positions(self):
        photos=[{"file":f"{i}.jpg"} for i in range(5)]
        calls=[]
        subject=SimpleNamespace(suggestion_generated=True,working=photos,locks={"1.jpg"},
            selection=lambda:2,populate=lambda i:calls.append(i),info=Mock())
        arrange_gallery.Arrange.reverse_suggestion(subject)
        self.assertEqual([p["file"] for p in subject.working],["4.jpg","1.jpg","3.jpg","2.jpg","0.jpg"])
        self.assertEqual(calls,[3])
        arrange_gallery.Arrange.reverse_suggestion(subject)
        self.assertEqual([p["file"] for p in subject.working],[p["file"] for p in photos])

    def test_reverse_suggestion_button_enables_after_generation(self):
        editor,media,data=self.isolated_editor()
        with patch.multiple(arrange_gallery,ROOT=media.parents[1],C_PATH=data):
            arranger=arrange_gallery.Arrange();self.windows.append(arranger)
            self.assertEqual(str(arranger.reverse_button.cget("state")),"disabled")
            arranger.suggest()
            before=[p["file"] for p in arranger.working]
            self.assertEqual(str(arranger.reverse_button.cget("state")),"normal")
            arranger.reverse_button.invoke()
            self.assertEqual([p["file"] for p in arranger.working],before[::-1])
            arranger.restore()
            self.assertEqual(str(arranger.reverse_button.cget("state")),"disabled")

    def test_arranger_buttons_track_generated_applied_and_opening_orders(self):
        editor,media,data=self.isolated_editor()
        def save_pair(c_text,j_text):data.write_text(c_text,encoding="utf-8")
        with patch.multiple(arrange_gallery,ROOT=media.parents[1],C_PATH=data), \
                patch.object(arrange_gallery,"atomic_catalog_pair",side_effect=save_pair), \
                patch.object(arrange_gallery.messagebox,"askyesno",return_value=True), \
                patch.object(arrange_gallery.messagebox,"showinfo"):
            arranger=arrange_gallery.Arrange();self.windows.append(arranger)
            self.assertEqual(str(arranger.apply_button.cget("state")),"disabled")
            self.assertEqual(str(arranger.restore_button.cget("state")),"disabled")
            arranger.suggest()
            self.assertEqual(str(arranger.generate_button.cget("state")),"disabled")
            arranger.mode.set("Color harmony")
            self.assertEqual(str(arranger.generate_button.cget("state")),"normal")
            arranger.mode.set("Balanced")
            self.assertEqual(str(arranger.generate_button.cget("state")),"disabled")
            arranger.reverse_suggestion()
            self.assertEqual(str(arranger.generate_button.cget("state")),"normal")
            self.assertEqual(str(arranger.apply_button.cget("state")),"normal")
            self.assertEqual(str(arranger.restore_button.cget("state")),"normal")
            arranger.save()
            self.assertEqual(str(arranger.apply_button.cget("state")),"disabled")
            self.assertEqual(str(arranger.restore_button.cget("state")),"normal")
            self.assertIsNot(arranger.catalog["photos"],arranger.working)
            arranger.restore()
            self.assertEqual(arranger.order(),arranger.opening_order)
            self.assertEqual(str(arranger.restore_button.cget("state")),"disabled")
            self.assertEqual(str(arranger.apply_button.cget("state")),"normal")
            arranger.save()
            self.assertEqual(str(arranger.apply_button.cget("state")),"disabled")
            self.assertEqual(str(arranger.restore_button.cget("state")),"disabled")

    def test_all_catalog_remove_actions_confirm_and_cancel_without_mutating(self):
        editor,media,data=self.isolated_editor()
        before=data.read_bytes();files={p.name:p.read_bytes() for p in media.iterdir()}
        for action in (lambda:editor.remove(False),lambda:editor.remove(True),editor.delete_published):
            with patch.object(manage_published.messagebox,"askyesno",return_value=False) as question, \
                    patch.object(manage_published,"save_transaction") as save:
                action();question.assert_called_once();save.assert_not_called();self.recycle.assert_not_called()
            self.assertEqual(data.read_bytes(),before)
            self.assertEqual({p.name:p.read_bytes() for p in media.iterdir()},files)

    def test_notification_choice_previews_unsaved_current_mode(self):
        studio=self.studio()
        with patch.object(studio_notifications,"settings",return_value={"mode":"soft","volume":30}), \
                patch.object(studio_notifications.threading,"Thread") as thread:
            win=studio_notifications.preferences(studio)
            try:
                frame=win.winfo_children()[0]
                radios=[child for child in frame.winfo_children() if isinstance(child,photo_studio.ttk.Radiobutton)]
                radios[2].invoke()
                self.assertEqual(thread.call_args.kwargs["args"][1],{"mode":"system","volume":30})
                radios[0].invoke()
                self.assertEqual(thread.call_args.kwargs["args"][1],{"mode":"soft","volume":30})
            finally:win.destroy()

    def test_rotation_undo_and_action_states(self):
        studio=self.studio()
        studio.refresh_action_states()
        self.assertEqual(str(studio.undo_button.cget("state")),"disabled")
        studio.deg_var.set("2.5");studio.refresh_action_states()
        self.assertEqual(str(studio.undo_button.cget("state")),"normal")
        studio.undo_rotation()
        self.assertEqual(float(studio.deg_var.get()),0)
        self.assertEqual(str(studio.undo_button.cget("state")),"disabled")
        studio.tag_vars[next(iter(studio.tag_vars))].set(True)
        studio.update_idletasks()
        reset=next(button for label,button,_ in studio.action_buttons if label=="Reset photo")
        self.assertEqual(str(reset.cget("state")),"normal")

    def test_rotation_undo_groups_typed_characters_into_one_task(self):
        studio=self.studio()
        for value in ("2","2.","2.5"):studio.deg_var.set(value)
        studio.undo_rotation()
        self.assertEqual(float(studio.deg_var.get()),0)
        studio.apply_rotation("3.25")
        studio.commit_rotation_edit()
        for value in ("4","4.","4.75"):studio.deg_var.set(value)
        studio.commit_rotation_edit();studio.undo_rotation()
        self.assertEqual(float(studio.deg_var.get()),3.25)

    def test_rotation_undo_restores_previous_complete_alignment(self):
        studio=self.studio()
        studio.apply_rotation("2.5")
        studio.apply_rotation("4.125")
        studio.undo_rotation()
        self.assertEqual(float(studio.deg_var.get()),2.5)

    def test_unchanged_photo_navigation_does_not_enable_reset(self):
        studio=self.studio()
        studio.save_current();studio.load_current(0);studio.refresh_action_states()
        for label,button,_ in studio.action_buttons:
            if label in ("Reset photo","Reset all"):
                self.assertEqual(str(button.cget("state")),"disabled")

    def test_catalog_loading_cached_photo_and_reset(self):
        editor=edit_tags.Editor();self.windows.append(editor)
        editor.update_idletasks()
        editor.load(0);editor.load(1);editor.load(0)
        initial=copy.deepcopy(editor.catalog)
        self.assertEqual(editor.status.get().startswith("Cannot show"),False)
        editor.review_var.set(False)
        editor.alt.set("Manually revised published photo description.")
        self.assertTrue(editor.review_var.get())
        editor.store()
        with patch.object(edit_tags.messagebox,"askyesno",return_value=True):editor.reset_all()
        self.assertEqual(editor.catalog,initial)
        self.assertEqual(str(editor.save_button.cget("state")),"disabled")
        self.assertEqual(len(editor.tabs.tabs()),1)
        self.assertIs(editor.management_toolbar.master,editor.catalog_page)
        self.assertIsNotNone(editor.viewport.source)

    def isolated_editor(self,missing=False):
        root=Path(self.temp.name)/"site"
        media=root/"photography"/"published";media.mkdir(parents=True)
        for name in ("a.jpg","b.jpg","extra.jpg"):
            Image.new("RGB",(600,400),(30,60,90)).save(media/name)
        photos=[{"file":name,"alt":name,"tags":[],"aspectRatio":1.5} for name in ("a.jpg","b.jpg")]
        if missing:photos.append({"file":"missing.jpg","alt":"Retained description","tags":[],"aspectRatio":1.5})
        catalog={"schemaVersion":1,"photoTags":[],"photos":photos}
        data=root/"data"/"media-catalog.json";data.parent.mkdir()
        runtime=root/"js"/"photography-catalog.js";runtime.parent.mkdir()
        data.write_text(json.dumps(catalog),encoding="utf-8")
        runtime.write_text(photo_studio.generated_js(catalog),encoding="utf-8")
        self.addCleanup(patch.stopall)
        patch.multiple(edit_tags,ROOT=root,C_PATH=data,J_PATH=runtime).start()
        patch.multiple(manage_published,ROOT=root,MEDIA=media,DATA=data,JS=runtime,
            JOURNAL=root/"_old").start()
        self.management_info=patch.object(manage_published.messagebox,"showinfo").start()
        self.management_error=patch.object(manage_published.messagebox,"showerror").start()
        patch.object(manage_published.messagebox,"askyesno",return_value=True).start()
        trash=Path(self.temp.name)/"simulated-recycle-bin";trash.mkdir()
        def recycle(paths):
            for path in paths:path.rename(trash/path.name)
        self.recycle=patch.object(manage_published,"recycle_files",side_effect=recycle).start()
        editor=edit_tags.Editor();self.windows.append(editor);editor.update_idletasks()
        return editor,media,data

    def select_name(self,editor,name):
        row=next(i for i,(_,filename,_) in enumerate(editor.photo_rows) if filename==name)
        editor.listbox.selection_clear(0,"end");editor.listbox.selection_set(row);editor.select()

    def test_merged_import_previews_unlisted_and_enables_editing(self):
        editor,media,data=self.isolated_editor()
        self.select_name(editor,"extra.jpg")
        self.assertEqual(editor.selected(),("Unlisted file","extra.jpg"))
        self.assertIsNone(editor.index);self.assertIsNotNone(editor.viewport.source)
        with patch.object(manage_published.simpledialog,"askstring",return_value="Imported description"):
            editor.run_management(editor.import_unlisted)
        self.management_error.assert_not_called()
        self.assertEqual(editor.selected(),("Published","extra.jpg"))
        self.assertIsNotNone(editor.index)
        self.assertEqual(editor.alt.get(),"Imported description")

    def test_merged_remove_keeps_jpeg_as_unlisted(self):
        editor,media,data=self.isolated_editor()
        before=(media/"a.jpg").read_bytes()
        editor.run_management(lambda:editor.remove(False))
        self.management_error.assert_not_called()
        self.assertEqual((media/"a.jpg").read_bytes(),before)
        self.assertEqual(editor.selected(),("Unlisted file","a.jpg"))
        self.assertEqual([p["file"] for p in json.loads(data.read_text())["photos"]],["b.jpg"])

    def test_merged_archive_and_permanent_delete_keep_remaining_selection_valid(self):
        editor,media,data=self.isolated_editor()
        editor.run_management(lambda:editor.remove(True))
        self.management_error.assert_not_called()
        self.assertFalse((media/"a.jpg").exists())
        self.assertTrue(list((media.parents[1]/"_old").rglob("a.jpg")))
        self.assertIsNotNone(editor.index)

    def test_merged_delete_requires_confirmation_and_removes_only_selected_file(self):
        editor,media,data=self.isolated_editor()
        with patch.object(manage_published.messagebox,"askyesno",return_value=False):
            editor.run_management(editor.delete_published)
        self.assertTrue((media/"a.jpg").exists())
        editor.run_management(editor.delete_published)
        self.management_error.assert_not_called()
        self.assertFalse((media/"a.jpg").exists());self.assertTrue((media/"b.jpg").exists())

    def select_names(self,editor,names):
        editor.listbox.selection_clear(0,"end")
        for row,(_,name,_) in enumerate(editor.photo_rows):
            if name in names:editor.listbox.selection_set(row);editor.listbox.activate(row)
        editor.select()

    def test_batch_remove_all_gallery_entries_keeps_files_and_selection(self):
        editor,media,data=self.isolated_editor()
        self.select_names(editor,{"a.jpg","b.jpg"})
        self.assertEqual(len(editor.selected_rows()),2)
        editor.run_management(lambda:editor.remove(False))
        self.management_error.assert_not_called()
        self.assertEqual(json.loads(data.read_text())["photos"],[])
        self.assertTrue((media/"a.jpg").exists() and (media/"b.jpg").exists())
        self.assertEqual(len(editor.selected_rows()),2)

    def test_batch_recycle_includes_unlisted_without_jpeg_archive(self):
        editor,media,data=self.isolated_editor()
        self.select_names(editor,{"a.jpg","extra.jpg"})
        editor.run_management(editor.delete_published)
        self.management_error.assert_not_called()
        self.assertFalse((media/"a.jpg").exists() or (media/"extra.jpg").exists())
        self.assertEqual([p["file"] for p in json.loads(data.read_text())["photos"]],["b.jpg"])
        self.assertFalse(list((media.parents[1]/"_old").rglob("*.jpg")))
        self.assertEqual(len(self.recycle.call_args.args[0]),2)

    def add_paired_thumbnail(self,editor,media,data,name="a.jpg"):
        photo=next(photo for photo in editor.catalog["photos"] if photo["file"]==name)
        thumb=media.parent/"thumbnails"/gallery_thumbnails.thumbnail_name(name)
        thumb.parent.mkdir(exist_ok=True)
        clean=processor.prepare_publication(self.path,max_side=600)
        encoded,size=processor.encode_gallery_thumbnail(clean)
        thumb.write_bytes(encoded)
        photo.update(gallery_thumbnails.thumbnail_fields(name,encoded,size))
        data.write_text(json.dumps(editor.catalog))
        (media.parents[1]/"js"/"photography-catalog.js").write_text(photo_studio.generated_js(editor.catalog))
        settings=photo_studio.new_settings(self.path,600)
        gallery_thumbnails.save_registry(media.parents[1],{name:gallery_thumbnails.source_record(self.path,settings,(media/name).read_bytes())})
        editor.refresh()
        return thumb

    def test_recycling_moves_full_photo_and_thumbnail_together(self):
        editor,media,data=self.isolated_editor()
        thumb=self.add_paired_thumbnail(editor,media,data)
        self.select_name(editor,"a.jpg");editor.run_management(editor.delete_published)
        self.management_error.assert_not_called()
        self.assertFalse(thumb.exists());self.assertFalse((media/"a.jpg").exists())
        self.assertEqual(len(self.recycle.call_args.args[0]),2)

    def test_archiving_moves_full_photo_and_thumbnail_together(self):
        editor,media,data=self.isolated_editor()
        thumb=self.add_paired_thumbnail(editor,media,data)
        self.select_name(editor,"a.jpg");editor.run_management(lambda:editor.remove(True))
        self.management_error.assert_not_called()
        self.assertFalse(thumb.exists());self.assertFalse((media/"a.jpg").exists())
        self.assertTrue(list((media.parents[1]/"_old").rglob(thumb.name)))

    def test_gallery_crop_edit_regenerates_thumbnail_without_reexporting_jpeg(self):
        editor,media,data=self.isolated_editor()
        thumb=self.add_paired_thumbnail(editor,media,data)
        original=(media/"a.jpg").read_bytes();before=thumb.read_bytes()
        self.select_name(editor,"a.jpg")
        editor.viewport.set_crop({"x":.2,"y":.1,"width":.5,"height":.6},notify=True)
        editor.apply_gallery_crop()
        with patch.object(edit_tags,"notify"):editor.save()
        self.management_error.assert_not_called()
        self.assertNotEqual(before,thumb.read_bytes())
        self.assertEqual(original,(media/"a.jpg").read_bytes())

    def test_matching_renamed_photo_moves_thumbnail_and_retains_original_record(self):
        editor,media,data=self.isolated_editor()
        old_thumb=self.add_paired_thumbnail(editor,media,data)
        (media/"a.jpg").rename(media/"renamed.jpg")
        editor.refresh();self.select_name(editor,"a.jpg")
        with patch.object(manage_published.simpledialog,"askstring",return_value="renamed.jpg"):
            editor.run_management(editor.match_rename)
        self.management_error.assert_not_called()
        self.assertFalse(old_thumb.exists())
        self.assertTrue((old_thumb.parent/"renamed.jpg.webp").is_file())
        self.assertEqual(len(list(old_thumb.parent.glob("*.webp"))),1)
        self.assertIn("renamed.jpg",gallery_thumbnails.read_registry(media.parents[1]))

    def test_recycle_partial_failure_retains_entries_for_files_not_moved(self):
        editor,media,data=self.isolated_editor()
        self.select_names(editor,{"a.jpg","b.jpg"})
        def partial(paths):
            paths[0].rename(Path(self.temp.name)/"simulated-recycle-bin"/paths[0].name)
            raise OSError("Second file locked")
        self.recycle.side_effect=partial
        editor.run_management(editor.delete_published)
        self.management_error.assert_called_once()
        self.assertFalse((media/"a.jpg").exists());self.assertTrue((media/"b.jpg").exists())
        self.assertEqual([p["file"] for p in json.loads(data.read_text())["photos"]],["b.jpg"])

    def test_recycle_failure_restores_catalog_and_keeps_photos(self):
        editor,media,data=self.isolated_editor()
        before=data.read_bytes()
        self.recycle.side_effect=OSError("Recycle Bin unavailable")
        editor.run_management(editor.delete_published)
        self.management_error.assert_called_once()
        self.assertEqual(data.read_bytes(),before);self.assertTrue((media/"a.jpg").exists())

    def test_batch_import_descriptions_and_selection(self):
        editor,media,data=self.isolated_editor()
        Image.new("RGB",(600,400),(20,40,60)).save(media/"extra2.jpg")
        editor.run_management(editor.refresh)
        self.select_names(editor,{"extra.jpg","extra2.jpg"})
        with patch.object(manage_published,"ask_import_descriptions",return_value={
            "extra.jpg":"First description","extra2.jpg":"Second description"}) as descriptions:
            editor.run_management(editor.import_unlisted)
        self.management_error.assert_not_called()
        self.assertEqual(len(descriptions.call_args.args[1]),2)
        self.assertEqual(len(json.loads(data.read_text())["photos"]),4)
        self.assertEqual(len(editor.selected_rows()),2)

    def test_batch_description_form_collects_all_descriptions(self):
        editor,media,data=self.isolated_editor()
        def complete_form():
            def descendants(widget):
                for child in widget.winfo_children():
                    yield child
                    yield from descendants(child)
            controls=list(descendants(editor))
            window=next(child for child in editor.winfo_children() if isinstance(child,tk.Toplevel))
            for index,entry in enumerate(child for child in descendants(window) if isinstance(child,photo_studio.ttk.Entry)):
                entry.insert(0,f"Description {index+1}")
            button=next(child for child in descendants(window) if isinstance(child,photo_studio.ttk.Button)
                and child.cget("text")=="Import 2 photos")
            button.invoke()
        editor.after(50,complete_form)
        result=manage_published.ask_import_descriptions(editor,["first.jpg","second.jpg"])
        self.assertEqual(result,{"first.jpg":"Description 1","second.jpg":"Description 2"})

    def test_batch_archive_supports_unlisted_and_all_catalog_entries(self):
        editor,media,data=self.isolated_editor()
        self.select_names(editor,{name for _,name,_ in editor.photo_rows})
        editor.run_management(lambda:editor.remove(True))
        self.management_error.assert_not_called()
        self.assertEqual(json.loads(data.read_text())["photos"],[])
        self.assertEqual(editor.photo_rows,[])
        self.assertEqual(len(list((media.parents[1]/"_old").rglob("*.jpg"))),3)

    def test_dialog_messages_have_real_newlines(self):
        editor,media,data=self.isolated_editor()
        editor.run_management(editor.delete_published)
        self.management_info.assert_called_once()
        for argument in self.management_info.call_args.args:
            self.assertNotIn("\\n",argument)
            self.assertNotIn("/n",argument)

    def test_recycling_every_file_leaves_an_empty_usable_editor(self):
        editor,media,data=self.isolated_editor()
        self.select_names(editor,{name for _,name,_ in editor.photo_rows})
        editor.run_management(editor.delete_published)
        self.management_error.assert_not_called()
        self.assertEqual(editor.photo_rows,[])
        self.assertEqual(json.loads(data.read_text())["photos"],[])
        self.assertIsNone(editor.viewport.source)

    def test_merged_missing_file_can_be_matched_and_previewed(self):
        editor,media,data=self.isolated_editor(missing=True)
        self.select_name(editor,"missing.jpg")
        self.assertIsNone(editor.viewport.source)
        with patch.object(manage_published.simpledialog,"askstring",return_value="extra.jpg"):
            editor.run_management(editor.match_rename)
        self.management_error.assert_not_called()
        self.select_name(editor,"extra.jpg")
        self.assertEqual(editor.alt.get(),"Retained description")
        self.assertIsNotNone(editor.viewport.source)

    def test_merged_management_does_not_discard_unsaved_edits(self):
        editor,media,data=self.isolated_editor()
        editor.alt.set("Unsaved description")
        self.select_name(editor,"extra.jpg")
        with patch.object(edit_tags.messagebox,"showwarning") as warning:
            editor.run_management(editor.import_unlisted)
        warning.assert_called_once()
        self.assertEqual(editor.photos[0]["alt"],"Unsaved description")
        self.assertEqual(str(editor.save_button.cget("state")),"normal")

    def test_toolbar_overflow_has_equivalents_and_preserves_values(self):
        studio=self.studio()
        studio.alt_var.set("Keep this description.")
        for width in (980,1280,1920):
            # Supply the allocated width without putting a test window on screen.
            for toolbar in (studio.crop_toolbar,studio.settings_toolbar):
                with patch.object(toolbar,"winfo_width",return_value=width-240):toolbar.reflow()
                toolbar.populate_menu()
                for frame, _label, _builder, _priority in toolbar.groups:
                    if frame.winfo_manager():
                        self.assertGreater(frame.winfo_reqwidth(),1)
                self.assertEqual(toolbar.menu.index("end"),len(toolbar.hidden)-1 if toolbar.hidden else None)
                # Native themes and fonts differ between Windows and macOS.
                # Every group must return when its measured content fits.
                required=sum(frame.winfo_reqwidth()+6 for frame, *_ in toolbar.groups)
                with patch.object(toolbar,"winfo_width",return_value=required):toolbar.reflow()
                self.assertFalse(toolbar.hidden)
                toolbar.populate_menu()
                self.assertIsNone(toolbar.menu.index("end"))
            self.assertEqual(studio.alt_var.get(),"Keep this description.")

    def test_primary_catalog_stays_visible_without_displacing_export_controls(self):
        studio=self.studio()
        catalog=next(button for label,button,_ in studio.action_buttons if label=="Published catalog")
        for width in (980,1280,1470,1710,1920):
            studio._last_toolbar_width=None
            with patch.object(studio.toolbar_action,"winfo_width",return_value=width):
                studio.update_toolbar_overflow()
            hidden={label for label,_,_ in studio.hidden_actions}
            self.assertNotIn("Published catalog",hidden)
            self.assertNotIn("Add original",hidden)
            self.assertEqual(catalog.winfo_manager(),"pack")
            self.assertEqual(studio.publish_row.winfo_manager(),"pack")
            self.assertEqual(studio.publish_group.master,studio.publish_row)
            visible=[button for _,button,_ in studio.action_buttons if button.winfo_manager()]
            occupied=sum(button.winfo_reqwidth()+5 for button in visible)
            if hidden:occupied+=studio.more_actions_button.winfo_reqwidth()+5
            self.assertLessEqual(occupied,width-16)
            studio.populate_action_menu()
            self.assertEqual(studio.action_menu.index("end"),len(hidden)-1 if hidden else None)
        # Leaving and returning to Photography restores the persistent export row.
        studio.workspace_tabs.select(studio.engineering_page)
        studio.workspace_changed()
        self.assertFalse(studio.publish_row.winfo_manager())
        studio.workspace_tabs.select(studio.photography_page)
        studio.workspace_changed()
        self.assertEqual(catalog.winfo_manager(),"pack")
        self.assertEqual(studio.publish_row.winfo_manager(),"pack")
        with patch.object(photo_studio.subprocess,"Popen") as launch:
            catalog.invoke()
        self.assertEqual(Path(launch.call_args.args[0][1]).name,"edit_tags.py")

    def test_small_crop_handles_select_nearest_edge(self):
        studio=self.studio();viewport=studio.viewport
        with patch.object(viewport,"_crop_rect_pixels",return_value=(100,100,120,120)):
            self.assertEqual(viewport._hit_crop(120,120),"se")
            self.assertEqual(viewport._hit_crop(100,100),"nw")
            self.assertEqual(viewport._hit_crop(120,100),"ne")
            self.assertEqual(viewport._hit_crop(100,120),"sw")

    def test_right_click_clears_applied_crop_only_in_crop_mode(self):
        studio=self.studio();viewport=studio.viewport
        crop={"x":.1,"y":.1,"width":.6,"height":.6}
        viewport.set_crop(crop,notify=True)
        viewport.right_click()
        self.assertIsNone(viewport.crop);self.assertIsNone(studio.crop_rect)
        self.assertFalse(studio.settings[str(self.path)]["cropApplied"])
        self.assertFalse(hasattr(studio,"apply_crop_button"))
        viewport.set_crop(crop,notify=True);viewport.set_mode("horizon")
        viewport.right_click();self.assertEqual(viewport.crop,crop)

    def test_right_click_clear_in_catalog_can_be_saved_as_full_photo(self):
        editor,media,data=self.isolated_editor()
        crop={"x":.1,"y":.1,"width":.6,"height":.6}
        editor.viewport.set_crop(crop,notify=True);editor.apply_gallery_crop()
        self.assertIn("galleryCrop",editor.photos[0])
        editor.viewport.right_click();editor.refresh_dirty()
        self.assertIsNone(editor.crop_rect)
        self.assertNotIn("galleryCrop",editor.photos[0])
        self.assertFalse(editor.crop_pending)

    def test_all_crop_handles_keep_opposite_anchor(self):
        studio=self.studio();viewport=studio.viewport
        viewport.source=Image.new("RGB",(1200,800))
        original={"x":.2,"y":.2,"width":.6,"height":.6}
        for ratio in (None,1,1.5,9/16):
            viewport.aspect_ratio=ratio
            for handle in ("nw","ne","sw","se","n","s","w","e"):
                for dx,dy in ((.1,.08),(-.5,-.5),(2,2)):
                    viewport.crop=dict(original)
                    viewport._edit=(handle,(.5,.5),dict(original));viewport._start=(50,50)
                    with patch.object(viewport,"point_to_image",return_value=(.5+dx,.5+dy)):
                        viewport._move_draw(SimpleNamespace(x=50,y=50))
                    result=normalize_crop(viewport._candidate)
                    if "w" in handle:self.assertAlmostEqual(result["x"]+result["width"],.8,places=5)
                    if "e" in handle:self.assertAlmostEqual(result["x"],.2,places=5)
                    if "n" in handle:self.assertAlmostEqual(result["y"]+result["height"],.8,places=5)
                    if "s" in handle:self.assertAlmostEqual(result["y"],.2,places=5)
                    if ratio:self.assertAlmostEqual(result["width"]/result["height"]*1.5,ratio,places=3)


if __name__=="__main__":unittest.main()
