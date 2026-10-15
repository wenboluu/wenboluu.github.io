# Wenbo Lu — homepage

Personal academic homepage. The first screen is a small interactive 3D scene: a seven-joint robot arm holding a photo, with an NYU badge and an IKEA BLÅHAJ shark hanging from it, in a bright studio room.

## Run locally

No build step and no npm install; Three.js r180 is vendored.

```sh
python3 -m http.server 4173
# open http://127.0.0.1:4173/
npm test          # kinematics, collision clearance, chain physics, mesher (Node 18+)
```

Append `?still` to the URL to settle the charms and stop the idle motion, for screenshots.

## Files

| File | Role |
| --- | --- |
| `index.html`, `style.css` | Page content and layout |
| `scene.js` | Renderer, camera framing, photo card, behaviour (idle breathing, hover, click greeting), render loop |
| `studio.js` | Room geometry and all lighting: window light, sun through window bars, skylight, floor reflection |
| `kinematics.js` | 7-joint arm: joint table, forward kinematics, Jacobian, damped-least-squares IK, grasp and workspace |
| `robot.js`, `robot-shapes.js`, `arm-worker.js`, `sdf.js` | Arm shells as signed-distance shapes, meshed in Web Workers and cached by the browser |
| `charms.js`, `physics.js` | NYU badge and shark charms; chain physics |
| `vendor/` | Three.js r180 (minified) and compact area-light tables |
| `assets/` | Portrait, Inter font, icons, shark model |
| `data/` | Publications data from the previous site, kept for the upcoming research section |

## Credits

Shark model: [“Blahaj” by Kaine_G](https://sketchfab.com/3d-models/blahaj-ce981de49111488c81ea646067abe1ec), CC BY 4.0, recoloured. Icons: Tabler Icons (MIT). Font: Inter (OFL). Three.js (MIT).
