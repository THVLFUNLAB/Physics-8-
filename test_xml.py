import zipfile
import re

with zipfile.ZipFile('mau_de_azota_docx.docx', 'r') as z:
    doc_xml = z.read('word/document.xml').decode('utf-8')
    rels_xml = z.read('word/_rels/document.xml.rels').decode('utf-8')

rels_map = {}
for match in re.finditer(r'<Relationship Id="([^"]+)" Type="[^"]*image" Target="([^"]+)"', rels_xml):
    rels_map[match.group(1)] = match.group(2)

print('Images in Document Order:')
for match in re.finditer(r'<(?:a:blip|v:imagedata)[^>]+(?:r:embed|r:id)="([^"]+)"', doc_xml):
    rid = match.group(1)
    if rid in rels_map:
        print(f'{rid} -> {rels_map[rid]}')
