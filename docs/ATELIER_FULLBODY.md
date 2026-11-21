# ATELIER — Full-body foundation

This branch develops ATELIER on top of the existing Wet Denier Lab implementation rather than replacing its real leg/stocking meshes with primitive geometry.

## Existing components to preserve
- `public/assets/leg.glb`: real skin and stocking meshes.
- `public/src/mesh.js`: glTF mesh loading and normals/UVs.
- `public/src/shaders.js`: textile, wetness, water and scene shaders.
- `public/src/pose.js`: cached pose deformation and normal transformation.
- `public/src/main.js`: interaction, fabric parameters and rendering.

## Full-body implementation gates
1. Introduce a licensed continuous full-body surface mesh (not cylinders), with UVs, skeleton, named anatomical regions, and a featureless commercial-mannequin presentation.
2. Keep skin and garment surfaces distinct. Implement aligned garment meshes with explicit fit and collision checks.
3. Transfer the existing wet fabric shader to garment UVs, preserving dry/wet material variation and local water state.
4. Use low-resolution collision/XPBD meshes, GPU-friendly material evaluation, cached poses, and adaptive update rates. Keep high-resolution render geometry separate from physics geometry.
5. Add performance and geometry validation: silhouette checks from multiple views, intersections, frame-time budget, pose stability, and material tests.

## Licensing
The repository's own code is MIT; `public/assets/ATTRIBUTION.md` identifies MakeHuman skin as CC0 and the stocking asset as CC BY 3.0. Keep attribution and do not assume reference images or third-party materials are MIT.

## Scope
This is an implementation branch. The current repository remains a leg-focused demonstration; no full-body asset is claimed to exist until it is added and verified.
