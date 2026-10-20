# The PowerPoint file the import tests read (src/fixtures/foreign.pptx): one written by another
# tool, python-pptx on its own template, with placeholders, shape styles, a table style, charts,
# a cropped picture, a group, notes and Hebrew text. Run it again after changing it:
#   python3 -I packages/pptx/src/fixtures/make-fixture.py packages/pptx/src/fixtures/foreign.pptx
import sys, io
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.oxml.ns import qn
from PIL import Image, ImageDraw

out = sys.argv[1]
prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

def rtl(paragraph):
    paragraph._p.get_or_add_pPr().set('rtl', '1')

# 1. A title slide.
s = prs.slides.add_slide(prs.slide_layouts[0])
s.shapes.title.text = 'Quarterly review 2026'
sub = s.placeholders[1]
sub.text = 'סקירה רבעונית · Product and growth'
rtl(sub.text_frame.paragraphs[0])
sub.text_frame.paragraphs[0].alignment = PP_ALIGN.CENTER
s.notes_slide.notes_text_frame.text = 'Open with the headline numbers.'

# 2. Bullets in a content placeholder, two levels, and a Hebrew paragraph.
s = prs.slides.add_slide(prs.slide_layouts[1])
s.shapes.title.text = 'What we shipped'
body = s.placeholders[1].text_frame
body.text = 'A faster editor'
p = body.add_paragraph(); p.text = 'Load time down 40%'; p.level = 1
p = body.add_paragraph(); p.text = 'Live charts'; p.level = 0
p = body.add_paragraph(); p.text = 'Import from PowerPoint'; p.level = 0
r = p.runs[0]; r.font.bold = True; r.font.color.rgb = RGBColor(0xC0, 0x39, 0x2B)
p = body.add_paragraph(); p.text = 'ייבוא וייצוא של קובצי PowerPoint'; rtl(p); p.alignment = PP_ALIGN.RIGHT

# 3. Shapes with the theme's default look, a text box, a connector.
s = prs.slides.add_slide(prs.slide_layouts[6])
kinds = [MSO_SHAPE.RECTANGLE, MSO_SHAPE.ROUNDED_RECTANGLE, MSO_SHAPE.OVAL, MSO_SHAPE.ISOSCELES_TRIANGLE,
         MSO_SHAPE.CHEVRON, MSO_SHAPE.RIGHT_ARROW, MSO_SHAPE.STAR_5_POINT, MSO_SHAPE.HEXAGON]
for i, kind in enumerate(kinds):
    sh = s.shapes.add_shape(kind, Inches(0.6 + (i % 4) * 3.1), Inches(0.6 + (i // 4) * 2.4), Inches(2.6), Inches(1.8))
    sh.text = ['Rect', 'Rounded', 'Oval', 'Triangle', 'Chevron', 'Arrow', 'Star', 'Hexagon'][i]
    if i == 1:
        sh.fill.solid(); sh.fill.fore_color.rgb = RGBColor(0x2E, 0x86, 0x6B)
        sh.line.color.rgb = RGBColor(0x1B, 0x4D, 0x3E); sh.line.width = Pt(4)
    if i == 2:
        sh.rotation = 20
tb = s.shapes.add_textbox(Inches(0.6), Inches(5.6), Inches(6), Inches(1))
tf = tb.text_frame; tf.word_wrap = True
tf.text = 'A text box: '
run = tf.paragraphs[0].add_run(); run.text = 'bold blue'; run.font.bold = True; run.font.size = Pt(28); run.font.color.rgb = RGBColor(0x1F, 0x4E, 0x99)
run = tf.paragraphs[0].add_run(); run.text = ' and italic'; run.font.italic = True; run.font.size = Pt(28)
c = s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(7), Inches(6.9), Inches(12.5), Inches(5.6))
c.line.width = Pt(3); c.line.color.rgb = RGBColor(0xE6, 0x7E, 0x22)
ln = c.line._get_or_add_ln(); tail = ln.makeelement(qn('a:tailEnd'), {'type': 'triangle'}); ln.append(tail)

# 4. A table.
s = prs.slides.add_slide(prs.slide_layouts[5])
s.shapes.title.text = 'Revenue by region'
rows, cols = 4, 3
t = s.shapes.add_table(rows, cols, Inches(1), Inches(1.8), Inches(11.3), Inches(3.6)).table
data = [['Region', 'Q3', 'Q4'], ['North', '1.2M', '1.6M'], ['South', '0.8M', '1.1M'], ['ישראל', '0.4M', '0.7M']]
for r in range(rows):
    for col in range(cols):
        t.cell(r, col).text = data[r][col]

# 5. Charts: columns and a pie.
s = prs.slides.add_slide(prs.slide_layouts[5])
s.shapes.title.text = 'Growth'
cd = CategoryChartData(); cd.categories = ['Q1', 'Q2', 'Q3', 'Q4']
cd.add_series('2025', (3.1, 4.0, 4.4, 5.2)); cd.add_series('2026', (3.8, 4.9, 5.6, 7.1))
ch = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(0.6), Inches(1.6), Inches(7.4), Inches(5.4), cd).chart
ch.has_legend = True; ch.legend.position = XL_LEGEND_POSITION.BOTTOM; ch.legend.include_in_layout = False
pd = CategoryChartData(); pd.categories = ['Web', 'Desktop', 'Mobile']; pd.add_series('Share', (0.5, 0.3, 0.2))
pie = s.shapes.add_chart(XL_CHART_TYPE.PIE, Inches(8.3), Inches(1.6), Inches(4.6), Inches(5.4), pd).chart
pie.has_title = True; pie.chart_title.text_frame.text = 'Platforms'

# 6. A picture, cropped, and a group.
img = Image.new('RGB', (1200, 800), '#87b5e8')
d = ImageDraw.Draw(img)
d.ellipse((760, 160, 980, 380), fill='#ffe9a8')
d.polygon([(0, 800), (0, 520), (380, 330), (700, 600), (1000, 380), (1200, 520), (1200, 800)], fill='#2f4f6f')
d.rectangle((0, 0, 120, 120), fill='#d62828'); d.rectangle((1080, 0, 1200, 120), fill='#2a9d4b')
buf = io.BytesIO(); img.save(buf, 'PNG'); buf.seek(0)
s = prs.slides.add_slide(prs.slide_layouts[6])
pic = s.shapes.add_picture(buf, Inches(0.6), Inches(0.6), Inches(7), Inches(4.6))
pic.crop_left = 0.1; pic.crop_right = 0.1
a = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(8.2), Inches(1), Inches(4.4), Inches(1.4))
a.text = 'Grouped card'
b = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(8.4), Inches(2.8), Inches(1.4), Inches(1.4))
grp = s.shapes.add_group_shape([a, b])
bg = s.background.fill; bg.solid(); bg.fore_color.rgb = RGBColor(0xF4, 0xF1, 0xEA)

prs.save(out)
print('saved', out)
