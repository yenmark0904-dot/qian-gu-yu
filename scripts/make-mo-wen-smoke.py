# Builds public/effects/mo-wen.webp (t446u ink smoke) from /workspace/ref/mo-wen-smoke-src.jpg. Run from /workspace:
#   python3 qgy-new/scripts/make-mo-wen-smoke.py && cp /tmp/mo-wen-smoke.webp qgy-new/public/effects/mo-wen.webp
# The baked checkerboard (12 px squares) is averaged out with a 9 px blur for thin smoke; full detail is kept only
# where the smoke is dense. Light paper (≥ ~200) → alpha 0, near-white fringe softened, dense smoke alpha 1, no global cap.
from PIL import Image
import numpy as np
src=Image.open('ref/mo-wen-smoke-src.jpg').convert('RGB')
a=np.asarray(src).astype(float); N=1024
L=0.299*a[...,0]+0.587*a[...,1]+0.114*a[...,2]
def gblur(img,sig):
    fy=np.fft.fftfreq(N)[:,None]; fx=np.fft.fftfreq(N)[None,:]
    g=np.exp(-2*(np.pi**2)*(sig**2)*(fx**2+fy**2))
    return np.real(np.fft.ifft2(np.fft.fft2(img)*g))
PAPER=226.0   # mean of the baked checker (≈245 / ≈207)
INK=22.0
Llp=gblur(L,9.0)                       # checker (12 px squares) averaged out
a_lp=np.clip((PAPER-6-Llp)/(PAPER-6-INK),0,1)
a_hi=np.clip((PAPER-L)/(PAPER-INK),0,1)  # full detail, only trusted where the smoke is dense
t=np.clip((a_lp-0.30)/(0.65-0.30),0,1); w=t*t*(3-2*t)
alpha=w*np.maximum(a_hi,a_lp)+(1-w)*a_lp
# soften only the near-white fringe; dense smoke fully opaque; no global cap / wash
lo,hi=0.04,0.18
t=np.clip((alpha-lo)/(hi-lo),0,1); soft=t*t*(3-2*t)
alpha=np.where(alpha<hi,alpha*soft,alpha)
alpha=np.clip(alpha/0.68,0,1)
# colour: dark ink (unblend from paper where trustworthy, ink tint elsewhere)
ink=np.array([14,21,30.])
wc=(alpha**4)[...,None]          # dense smoke keeps its own dark strokes; thinner smoke takes the ink tone
C=np.minimum(a,255)*wc+ink*(1-wc)
C=np.minimum(C, ink+ (a-ink)*0.55)  # never a light grey wash
out=np.dstack([C,alpha*255]).astype(np.uint8)
im=Image.fromarray(out,'RGBA').resize((640,640),Image.LANCZOS)
im.save('/tmp/mo-wen-smoke.webp','WEBP',quality=90,method=6)
for nm,col in (('jade',(70,120,100,255)),('light',(230,225,210,255))):
    bg=Image.new('RGBA',im.size,col); bg.alpha_composite(im); bg.convert('RGB').save(f'/tmp/mo-wen-preview-{nm}.png')
al=np.asarray(im)[...,3]; print('opaque',(al>250).mean(),'clear',(al<5).mean())
