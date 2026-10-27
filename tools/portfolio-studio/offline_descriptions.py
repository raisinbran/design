"""Small CPU-only image classifier, constrained to generic public labels.

Inference never accesses the network. Model installation is a separate operation.
Model: ONNX Model Zoo MobileNet v2, ImageNet-1k. No location recognition or training.
"""
import hashlib
import os
from pathlib import Path
import threading
from PIL import Image, ImageOps, ImageStat
from platform_support import cache_path

MODEL_SHA256="c0c3f76d93fa3fd6580652a45618618a220fced18babf65774ed169de0432ad5"
LABELS_SHA256="acf75ef0abe89694b19056e0796401068b459c457baa30335f240c7692857355"
_network=None
_labels=None
_lock=threading.Lock()


def model_folder():
    return cache_path()/"models"


def verified(path,digest):
    return path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest()==digest


def model_ready():
    folder=model_folder()
    return verified(folder/"mobilenetv2-12.onnx",MODEL_SHA256) and verified(folder/"synset.txt",LABELS_SHA256)


def generic_class(index,description):
    """Never expose raw ImageNet labels (which include breeds and proper nouns)."""
    if 151<=index<=268:return "Dog"
    if 281<=index<=285:return "Cat"
    if index<=397:
        if index<=6 or 389<=index<=397:return "Fish"
        if 7<=index<=24 or 80<=index<=100 or 127<=index<=145:return "Bird"
        if 33<=index<=37:return "Turtle"
        if 52<=index<=68:return "Snake"
        if 107<=index<=126:return "Marine life"
        return "Animal"
    text=description.casefold()
    groups=(
        ("Mountains",("alp", "volcano")),
        ("Lakeside",("lakeside", "lakeshore")),
        ("Coast",("seashore", "promontory", "sandbar", "coral reef")),
        ("Landscape",("valley", "cliff")),
        ("Religious building",("monastery", "mosque", "church", "stupa")),
        ("Historic building",("palace", "castle")),
        ("Bridge",("bridge", "viaduct")),
        ("Boat",("boat", "gondola", "canoe", "yawl", "catamaran", "liner", "schooner", "ship")),
        ("Train",("locomotive", "streetcar", "bullet train", "railcar")),
        ("Vehicle",("truck", "car wheel", "cab,", "bus,", "jeep", "motor scooter", "bicycle")),
        ("Street scene",("traffic light", "street sign", "bookshop", "cinema", "restaurant", "grocery store")),
        ("Structure",("telescope", "crane", "beacon", "water tower", "dome")),
        ("Building",("library", "barn", "boathouse", "greenhouse", "skyscraper", "prison", "lighthouse")),
        ("Fountain",("fountain",)), ("Trees",("tree", "forest")),
        ("Flowers",("daisy", "flower",)), ("Plants",("plant", "rapeseed", "corn", "hay")),
        ("Food",("plate", "pizza", "bread", "fruit", "strawberry", "orange", "lemon", "soup", "dish", "ice cream", "food")),
        ("Interior",("room", "altar", "theater curtain", "window shade", "desk", "couch", "studio couch")),
        ("Aircraft",("airliner", "warplane", "airship")),
    )
    return next((label for label,terms in groups if any(term in text for term in terms)),None)


def fallback_label(image):
    sample=image.convert("L");sample.thumbnail((64,64))
    if ImageStat.Stat(sample).mean[0]<45:return "Dark scene"
    if image.width>image.height:return "Wide composition"
    if image.height>image.width:return "Vertical composition"
    return "Square composition"


def describe(image):
    """Return one to three generic words; uncertain results remain reviewable."""
    global _network,_labels
    import cv2
    import numpy as np
    fallback=fallback_label(image)
    with _lock:
        if _network is None:
            if not model_ready():return fallback
            folder=model_folder()
            try:
                _network=cv2.dnn.readNetFromONNX(str(folder/"mobilenetv2-12.onnx"),engine=cv2.dnn.ENGINE_CLASSIC)
            except (AttributeError,TypeError):
                _network=cv2.dnn.readNetFromONNX(str(folder/"mobilenetv2-12.onnx"))
            _labels=(folder/"synset.txt").read_text(encoding="utf-8").splitlines()
        frame=ImageOps.fit(image.convert("RGB"),(224,224),method=Image.Resampling.LANCZOS)
        pixels=np.asarray(frame,dtype=np.float32)/255
        pixels=(pixels-np.array([.485,.456,.406],np.float32))/np.array([.229,.224,.225],np.float32)
        _network.setInput(pixels.transpose(2,0,1)[None].copy())
        logits=_network.forward().reshape(-1)
        scores=np.exp(logits-logits.max());scores/=scores.sum()
        # Coarse groups combine breeds/variants rather than naming specific species.
        totals={}
        for index in np.argsort(scores)[-10:]:
            label=generic_class(int(index),_labels[index])
            if label:totals[label]=totals.get(label,0)+float(scores[index])
        if not totals:return fallback
        label,confidence=max(totals.items(),key=lambda entry:entry[1])
        return label if confidence>=.25 else fallback
