
import zipfile
import xml.etree.ElementTree as ET
import sys
import os

def extract_text_from_docx(docx_path):
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    
    with zipfile.ZipFile(docx_path, 'r') as z:
        with z.open('word/document.xml') as f:
            tree = ET.parse(f)
    
    root = tree.getroot()
    paragraphs = root.findall('.//w:p', ns)
    
    lines = []
    for p in paragraphs:
        texts = p.findall('.//w:t', ns)
        line = ''.join(t.text or '' for t in texts)
        lines.append(line)
    
    return lines

if __name__ == '__main__':
    desktop = os.path.join(os.path.expanduser('~'), 'OneDrive', 'デスクトップ')
    for f in os.listdir(desktop):
        if f.endswith('.docx'):
            path = os.path.join(desktop, f)
            print(f"=== {f} ===")
            lines = extract_text_from_docx(path)
            for line in lines:
                print(line)
            break
