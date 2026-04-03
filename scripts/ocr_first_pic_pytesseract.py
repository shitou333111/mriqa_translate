#!/usr/bin/env python3
"""
OCR all images in first_pic/ using pytesseract (English).
Outputs per-image JSON in first_pic/ocr_results/ and a summary TSV first_pic/ocr_summary.tsv
Each JSON contains image size and list of boxes: text, bbox, conf, color(hex).

Requirements:
  pip install pillow pytesseract numpy
Also install Tesseract OCR engine on your system and ensure it's on PATH.

Run from repo root:
  python scripts/ocr_first_pic_pytesseract.py
"""
from pathlib import Path
import pytesseract
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
from PIL import Image
import json
import os
import numpy as np
import math

ROOT = Path(__file__).resolve().parents[1]
FIRST_DIR = ROOT / 'first_pic'
OUT_DIR = FIRST_DIR / 'ocr_results'
OUT_DIR.mkdir(parents=True, exist_ok=True)
SUMMARY = FIRST_DIR / 'ocr_summary.tsv'
TEXT_DIR = FIRST_DIR / 'ocr_texts'
TEXT_DIR.mkdir(parents=True, exist_ok=True)

def _hex(c):
    return '#%02x%02x%02x' % (int(c[0]), int(c[1]), int(c[2]))

def sample_text_color(crop: Image.Image):
    # crop -> numpy array
    arr = np.array(crop.convert('RGBA'))
    if arr.size == 0:
        return '#000000'
    # compute luminance
    r,g,b,a = arr[:,:,0], arr[:,:,1], arr[:,:,2], arr[:,:,3]
    lum = 0.299*r + 0.587*g + 0.114*b
    # mask of dark-ish pixels (likely text); threshold adaptive
    thresh = np.percentile(lum, 70)
    mask = lum < thresh
    if mask.sum() < 5:
        # fallback to average color of whole crop
        avg = np.mean(arr[:,:,0:3].reshape(-1,3), axis=0)
        return _hex(avg)
    sel = arr[:,:,0:3][mask]
    avg = np.mean(sel, axis=0)
    return _hex(avg)

def ocr_image(img_path: Path):
    img = Image.open(img_path).convert('RGB')
    w,h = img.size
    data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT, lang='eng')
    n = len(data['text'])
    boxes = []
    for i in range(n):
        text = data['text'][i].strip()
        # conf may be str or int or float-like; handle robustly
        conf_raw = data['conf'][i]
        try:
            conf = int(float(conf_raw))
        except Exception:
            conf = -1
        if not text:
            continue
        left = int(data['left'][i]); top = int(data['top'][i]); width = int(data['width'][i]); height = int(data['height'][i])
        # crop region with small padding
        pad = max(2, int(min(width, height) * 0.1))
        lx = max(0, left - pad); ty = max(0, top - pad)
        rx = min(w, left + width + pad); by = min(h, top + height + pad)
        crop = img.crop((lx, ty, rx, by))
        color = sample_text_color(crop)
        boxes.append({
            'text': text,
            'conf': conf,
            'left': left,
            'top': top,
            'width': width,
            'height': height,
            'color': color
        })
    return {'image': str(img_path.name), 'width': w, 'height': h, 'boxes': boxes}

def main():
    entries = []
    for p in sorted(FIRST_DIR.iterdir()):
        if p.is_dir():
            continue
        if p.suffix.lower() not in ('.png','.jpg','.jpeg','.gif','.bmp','tif','tiff'):
            continue
        try:
            res = ocr_image(p)
        except Exception as e:
            print('Error OCR', p, e)
            continue
        out = OUT_DIR / (p.stem + '.json')
        with out.open('w', encoding='utf-8') as f:
            json.dump(res, f, ensure_ascii=False, indent=2)
        # also write a plain text file with full OCR text (use pytesseract full string)
        try:
            full_text = pytesseract.image_to_string(Image.open(p).convert('RGB'), lang='eng')
        except Exception:
            full_text = ''
        txt_out = TEXT_DIR / (p.stem + '.txt')
        with txt_out.open('w', encoding='utf-8') as tf:
            tf.write(full_text)
        # build summary line: filename, width, height, joined text (short)
        texts = ' | '.join([b['text'] for b in res['boxes']])
        entries.append((p.name, res['width'], res['height'], texts))

    with SUMMARY.open('w', encoding='utf-8') as f:
        f.write('filename\twidth\theight\ttexts\n')
        for e in entries:
            # escape newlines in the summary TSV
            text_field = e[3].replace('\n', ' ').replace('\t', ' ')
            f.write(f"{e[0]}\t{e[1]}\t{e[2]}\t{text_field}\n")
    print('OCR done:', len(entries), 'images processed. Results in', OUT_DIR, 'and', SUMMARY)

if __name__ == '__main__':
    main()
