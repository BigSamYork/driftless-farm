// Review candidates only. Approval requires matching art, geometry, and motion layers.
// Entries marked firstPlayable were selected by the user for the 2.0 first playable build. They are NOT
// final approvals: approved stays false, and only js/painted.js draws them, at fixed measured geometry.
// width/height are measured native sizes; loading rejects a file whose decoded size differs.
// edgeMatched: left and right edge columns were measured identical, so the layer may scroll horizontally.
const PAINTED_ART_DIR = 'Images/painted/';
const firstPlayableArt = (file, width, height, extra = {}) => ({ src: PAINTED_ART_DIR + file, approved: false, firstPlayable: true, width, height, ...extra });
const ASSET_MANIFEST = {
  images: {
    f20_new: { src: 'asset-audit/images/standalone/sprites__machinery__tractor_new.png', approved: false },
    f20_aged: { src: 'asset-audit/images/standalone/sprites__machinery__tractor_aged.png', approved: false },
    binder_new: { src: 'asset-audit/images/standalone/sprites__machinery__binder_new.png', approved: false },
    binder_aged: { src: 'asset-audit/images/standalone/sprites__machinery__binder_aged.png', approved: false },
    p_sky: firstPlayableArt('harvest_sky.png', 1376, 768),
    p_far_hills: firstPlayableArt('harvest_far_hills.png', 1376, 768, { edgeMatched: true }),
    // Also mixed into the Classic renderer (js/art.js) as its sky and distant bluffs, with a procedural fallback.
    p_sky_winter: firstPlayableArt('harvest_sky_winter.png', 1376, 768),
    p_far_hills_spring: firstPlayableArt('harvest_far_hills_spring.png', 1376, 768),
    p_far_hills_winter: firstPlayableArt('harvest_far_hills_winter.png', 1376, 768),
    p_near_hills: firstPlayableArt('harvest_near_hills_muted_candidate.png', 1376, 768, { edgeMatched: true }),
    p_ground_tan: firstPlayableArt('harvest_field_ground_tan_candidate.png', 1376, 768, { edgeMatched: true }),
    p_ground_green: firstPlayableArt('harvest_field_ground_green_candidate.png', 1376, 768, { edgeMatched: true }),
    p_oats: firstPlayableArt('harvest_standing_oats_tile_native.png', 1010, 768),
    p_yard_summer: firstPlayableArt('harvest_fixed_farmyard.png', 688, 1552),
    p_yard_winter: firstPlayableArt('harvest_fixed_farmyard_winter.png', 688, 1552),
    p_ingrid: firstPlayableArt('harvest_ingrid_standing_candidate.png', 754, 1125),
    p_pie: firstPlayableArt('harvest_dinner_pie_candidate.png', 768, 768),
    p_f20_body: firstPlayableArt('farmall_f20_body_new_candidate.png', 1376, 768),
    p_f20_tire: firstPlayableArt('farmall_f20_rear_wheel_pneumatic_candidate.png', 768, 768),
    p_f20_driver: firstPlayableArt('farmall_f20_driver_seated_candidate.png', 1028, 768),
    p_silo: firstPlayableArt('buildings/stave_silo.png', 213, 555),
    p_windmill_tower: firstPlayableArt('buildings/windmill_tower_tail_repaired.png', 242, 555),
    p_windmill_rotor: firstPlayableArt('buildings/windmill_rotor_repair_04.png', 188, 188),
    p_cheese_house: firstPlayableArt('buildings/cheese_house.png', 312, 251),
    p_granary: firstPlayableArt('buildings/granary_revision_03.png', 340, 361),
    p_tobacco_shed: firstPlayableArt('buildings/tobacco_drying_shed.png', 475, 254),
  },
  spriteSets: {
    farmall_f20: { fresh: 'f20_new', aged: 'f20_aged', approved: false, modes: ['idle'] },
    mccd_binder: { fresh: 'binder_new', aged: 'binder_aged', approved: false, modes: ['idle'] },
  },
  machines: { farmall_f20: 'farmall_f20', mccd_binder: 'mccd_binder' },
  cars: {},
};
