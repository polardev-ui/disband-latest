# App Store screenshots (3D)

Seven iPhone screenshots in the commercial's 3D style, at both sizes App Store
Connect asks for: `6.9-inch/` (1320×2868) and `6.5-inch/` (1284×2778). RGB PNG,
no alpha, upload in numeric order.

Rebuild: run `npm run capture` in `../commercial` (UI textures), then
`node render.mjs` here (`node render.mjs 4` re-renders one shot). Shots,
captions and camera framing live in `screenshots.html`.

Screens are the iOS 1.13 recreations from `../commercial/ui/ios.html`, with the
App Review demo personas only; captions claim only features present in
`ios/DisbandiOS`.
