"""One-time model download. No images are read; inference works offline afterward."""
import os
import tempfile
from pathlib import Path
import urllib.request
from offline_descriptions import model_folder,verified,MODEL_SHA256,LABELS_SHA256

ASSETS=(
    ("mobilenetv2-12.onnx",MODEL_SHA256,"https://media.githubusercontent.com/media/onnx/models/main/validated/vision/classification/mobilenet/model/mobilenetv2-12.onnx"),
    ("synset.txt",LABELS_SHA256,"https://raw.githubusercontent.com/onnx/models/main/validated/vision/classification/synset.txt"),
)


def setup():
    folder=model_folder();folder.mkdir(parents=True,exist_ok=True)
    for name,digest,url in ASSETS:
        target=folder/name
        if verified(target,digest):continue
        fd,temp=tempfile.mkstemp(dir=folder,suffix=".download");os.close(fd)
        try:
            with urllib.request.urlopen(url,timeout=30) as source,open(temp,"wb") as stream:
                while chunk:=source.read(1024*1024):stream.write(chunk)
            if not verified(Path(temp),digest):raise ValueError("Description model checksum mismatch")
            os.replace(temp,target)
        finally:
            if os.path.exists(temp):os.unlink(temp)
    print("Offline description model ready.")


if __name__=="__main__":
    try:setup()
    except (OSError,ValueError) as exc:
        print(f"Offline model setup unavailable: {exc}. Studio can still use generic labels.")
