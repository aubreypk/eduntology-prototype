"""Every colour pair in both palettes, against WCAG 2.1 AA.

    python docs/check_contrast.py

Layer 2 of the evaluation audits this interface automatically, so the palette
had better be right before the audit says so. This reads the stylesheet, pulls
the dark tokens and the light overrides out of it, and checks every foreground
against every surface it actually sits on. Exit status 1 on any failure.
"""
import re, sys
import os
HERE = os.path.dirname(os.path.abspath(__file__))
CSS = os.path.join(HERE, '..', 'web', 'src', 'styles.css')

def srgb(c):
    c/=255.0
    return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def lum(h):
    h=h.lstrip('#')
    r,g,b=(int(h[i:i+2],16) for i in (0,2,4))
    return 0.2126*srgb(r)+0.7152*srgb(g)+0.0722*srgb(b)
def ratio(a,b):
    la,lb=lum(a),lum(b); hi,lo=max(la,lb),min(la,lb)
    return (hi+0.05)/(lo+0.05)

css = open(CSS).read()
base = dict(re.findall(r'--([a-z-]+):\s*(#[0-9a-fA-F]{6});', css.split('@media (prefers-color-scheme: light)')[0]))
light_block = css.split('@media (prefers-color-scheme: light)')[1].split('}\n}')[0]
light = dict(base)
light.update(dict(re.findall(r'--([a-z-]+):\s*(#[0-9a-fA-F]{6});', light_block)))

GROUNDS=['ground','surface','raised','sunken']
TEXT=['ink','ink-soft','ink-dim','accent','xp','good','bad','warn',
      'lv-remember','lv-understand','lv-apply','lv-analyse','lv-evaluate','lv-create','code-ink']
NOTES=['note-good-bg','note-bad-bg','note-warn-bg']

total=0; fails=[]
for name, V in (('dark', base), ('light', light)):
    rows=[]
    for bg in GROUNDS:
        for fg in TEXT:
            rows.append((fg,bg,ratio(V[fg],V[bg]),4.5))
        rows.append(('edge',bg,ratio(V['edge'],V[bg]),3.0))
    rows.append(('accent-ink','accent',ratio(V['accent-ink'],V['accent']),4.5))
    for n in NOTES:
        for fg in ('ink','ink-soft'):
            rows.append((fg+' on '+n, n, ratio(V[fg],V[n]),4.5))
    bad=[r for r in rows if r[2]<r[3]]
    total+=len(rows); fails+=[(name,)+r for r in bad]
    worst=sorted(rows,key=lambda x:x[2])[0]
    print('%-6s %3d pairs, %d fail, tightest %s on %s at %.2f (need %.1f)'
          % (name, len(rows), len(bad), worst[0], worst[1], worst[2], worst[3]))
print()
if fails:
    for f in fails: print('  FAIL %s: %-24s on %-14s %.2f needs %.1f' % f)
    sys.exit(1)
print('Both palettes: all %d pairs meet WCAG 2.1 AA.' % total)
