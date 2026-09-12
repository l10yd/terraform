//#region src/sim/defs.ts
var RES_IDS = [
	"water",
	"minerals",
	"energy",
	"biomass",
	"research"
];
var BIOME_ORDER = [
	"barren",
	"rockwaste",
	"mineralfield",
	"tundra",
	"grassland",
	"forest",
	"wetland",
	"desert",
	"ocean",
	"alpine",
	"tropical",
	"ecozone",
	"river"
];
var LIVING_BIOMES = [
	"tundra",
	"grassland",
	"forest",
	"wetland",
	"alpine",
	"tropical",
	"ecozone",
	"river"
];
var WATER_BIOMES = ["ocean", "river"];
var clamp01 = (x) => Math.max(0, Math.min(1, x));
/** bell curve: 1 at center, 0 outside half-width */
function bell(x, c, w) {
	const d = Math.abs(x - c) / w;
	return d >= 1 ? 0 : 1 - d * d;
}
var minScale = (x, need) => clamp01(x / need);
var BIOMES = {
	barren: {
		id: "barren",
		placeable: false,
		unlock: null,
		cost: {},
		icon: "∅",
		color: [
			.4,
			.365,
			.32
		],
		y: { bioBase: 0 },
		suit: () => 1,
		req: null,
		reqKey: "",
		grow: 0,
		descKey: "biome.barren"
	},
	rockwaste: {
		id: "rockwaste",
		placeable: true,
		unlock: null,
		cost: { minerals: 3 },
		icon: "▒",
		color: [
			.33,
			.32,
			.315
		],
		y: {
			bioBase: 1,
			mProd: .15,
			fertAdd: 2
		},
		suit: (t) => .35 + .2 * clamp01(t.elev / 4),
		req: null,
		reqKey: "",
		grow: .06,
		descKey: "biome.rockwaste"
	},
	mineralfield: {
		id: "mineralfield",
		placeable: true,
		unlock: "geo_seismic",
		cost: {
			minerals: 6,
			energy: 3
		},
		icon: "◆",
		color: [
			.355,
			.385,
			.44
		],
		y: {
			bioBase: 2,
			mProd: 1.6,
			dPoll: .25
		},
		suit: (t) => t.dep > 0 ? .5 + .18 * t.dep : 0,
		req: (t) => t.dep > 0,
		reqKey: "req.deposit",
		grow: .05,
		descKey: "biome.mineralfield"
	},
	tundra: {
		id: "tundra",
		placeable: true,
		unlock: null,
		cost: {
			water: 4,
			minerals: 3
		},
		icon: "❄",
		color: [
			.5,
			.565,
			.52
		],
		y: {
			bioBase: 6,
			dO2: .1,
			bio: .25,
			moistAdd: .5,
			fertAdd: 3
		},
		suit: (t, p) => bell(p.temp, -6, 36) * minScale(t.fert, 16) * clamp01(.3 + t.moist / 40),
		req: (t) => t.elev <= 4,
		reqKey: "req.lowland",
		grow: .13,
		descKey: "biome.tundra"
	},
	grassland: {
		id: "grassland",
		placeable: true,
		unlock: null,
		cost: {
			water: 6,
			minerals: 4
		},
		icon: "≈",
		color: [
			.34,
			.62,
			.22
		],
		y: {
			bioBase: 12,
			dO2: .22,
			dH: .18,
			bio: .5,
			moistAdd: .8,
			fertAdd: 4
		},
		suit: (t, p) => bell(p.temp, 7, 33) * minScale(t.fert, 26) * minScale(t.moist, 22),
		req: (t) => t.elev >= 1 && t.elev <= 3,
		reqKey: "req.plains",
		grow: .18,
		descKey: "biome.grassland"
	},
	forest: {
		id: "forest",
		placeable: true,
		unlock: null,
		cost: {
			water: 11,
			minerals: 6
		},
		icon: "♠",
		color: [
			.1,
			.34,
			.13
		],
		y: {
			bioBase: 20,
			dO2: .5,
			dH: .4,
			dT: -.018,
			bio: 1,
			moistAdd: 1.6,
			fertAdd: 5
		},
		suit: (t, p) => bell(p.temp, 9, 33) * minScale(t.fert, 40) * minScale(t.moist, 34),
		req: null,
		reqKey: "",
		grow: .14,
		descKey: "biome.forest"
	},
	wetland: {
		id: "wetland",
		placeable: true,
		unlock: "bio_lichen",
		cost: {
			water: 8,
			minerals: 4,
			biomass: 2
		},
		icon: "≋",
		color: [
			.15,
			.44,
			.33
		],
		y: {
			bioBase: 24,
			dO2: .3,
			dH: .55,
			bio: 1.4,
			moistAdd: 2.2,
			fertAdd: 6,
			dPoll: -.2
		},
		suit: (t, p) => bell(p.temp, 11, 34) * minScale(t.moist, 50) * minScale(t.fert, 32),
		req: (t, _g, _i, ctx) => t.elev <= 2 && (t.moist >= 45 || hasWaterNeighbor(ctx)),
		reqKey: "req.wetlow",
		grow: .11,
		descKey: "biome.wetland"
	},
	desert: {
		id: "desert",
		placeable: true,
		unlock: null,
		cost: { minerals: 3 },
		icon: "∴",
		color: [
			.68,
			.56,
			.34
		],
		y: {
			bioBase: 2,
			dT: .012,
			dH: -.25
		},
		suit: (t, p) => clamp01(.25 + (p.temp - 5) / 40) * (t.moist < 55 ? 1 : .25),
		req: (t) => t.elev <= 3,
		reqKey: "req.lowland",
		grow: .05,
		descKey: "biome.desert"
	},
	ocean: {
		id: "ocean",
		placeable: true,
		unlock: null,
		cost: {
			water: 12,
			minerals: 6
		},
		icon: "◉",
		color: [
			.09,
			.28,
			.46
		],
		y: {
			bioBase: 8,
			dH: .8,
			dT: 0,
			moistAdd: 4
		},
		suit: (t, p) => (t.elev <= 1 ? 1 : .15) * clamp01((p.temp + 60) / 45),
		req: (t, _g, _i, ctx) => t.elev <= 1 && (t.moist >= 35 || hasWaterNeighbor(ctx)),
		reqKey: "req.basin",
		grow: .14,
		descKey: "biome.ocean"
	},
	alpine: {
		id: "alpine",
		placeable: true,
		unlock: "geo_orogeny",
		cost: {
			minerals: 14,
			energy: 4
		},
		icon: "▲",
		color: [
			.55,
			.58,
			.63
		],
		y: {
			bioBase: 9,
			dH: .5,
			moistAdd: 2.5,
			dT: -.006
		},
		suit: (t) => t.elev >= 3 ? 1 : .2,
		req: (t) => t.elev >= 3,
		reqKey: "req.highland",
		grow: .08,
		descKey: "biome.alpine"
	},
	tropical: {
		id: "tropical",
		placeable: true,
		unlock: "bio_canopy",
		cost: {
			water: 15,
			minerals: 8,
			biomass: 5
		},
		icon: "❖",
		color: [
			.14,
			.47,
			.23
		],
		y: {
			bioBase: 34,
			dO2: .75,
			dH: .6,
			dT: -.01,
			bio: 1.8,
			moistAdd: 1.8,
			fertAdd: 4
		},
		suit: (t, p) => bell(p.temp, 26, 16) * minScale(t.fert, 55) * minScale(t.moist, 48),
		req: (t) => t.elev >= 1 && t.elev <= 2,
		reqKey: "req.lowland",
		grow: .13,
		descKey: "biome.tropical"
	},
	ecozone: {
		id: "ecozone",
		placeable: true,
		unlock: "hab_terra",
		cost: {
			water: 16,
			minerals: 12,
			biomass: 8,
			energy: 6
		},
		icon: "✳",
		color: [
			.26,
			.62,
			.42
		],
		y: {
			bioBase: 42,
			dO2: .5,
			dH: .5,
			bio: 2.4,
			moistAdd: 1.5,
			fertAdd: 8,
			dPoll: -.5
		},
		suit: (t, p) => bell(p.temp, 16, 26) * minScale(t.fert, 65) * minScale(t.moist, 45),
		req: (t, _g, _i, ctx) => ctx.distinctNearBiomes >= 2,
		reqKey: "req.diversity",
		grow: .1,
		descKey: "biome.ecozone"
	},
	river: {
		id: "river",
		placeable: true,
		unlock: "hyd_rivers",
		cost: {
			water: 7,
			minerals: 4
		},
		icon: "∿",
		color: [
			.22,
			.48,
			.68
		],
		y: {
			bioBase: 14,
			dH: .3,
			moistAdd: 5,
			dO2: .08
		},
		suit: (t) => t.elev <= 3 ? .9 : .3,
		req: (_t, _g, _i, ctx) => hasWaterNeighbor(ctx),
		reqKey: "req.waterlink",
		grow: .12,
		descKey: "biome.river"
	}
};
function hasWaterNeighbor(ctx) {
	return ctx.nearBiomes.has("ocean") || ctx.nearBiomes.has("river") || ctx.nearBiomes.has("wetland");
}
var STRUCTURE_ORDER = [
	"hub",
	"solar",
	"battery",
	"extractor",
	"mine",
	"geo",
	"research",
	"atmos",
	"biodivlab",
	"weather",
	"habitat"
];
var STRUCTURES = {
	hub: {
		id: "hub",
		unlock: null,
		cost: {},
		icon: "⌂",
		color: [
			.72,
			.62,
			.45
		],
		y: {
			mProd: .6,
			eProd: .5,
			rp: .3,
			wProd: .4
		},
		req: null,
		reqKey: "",
		pollution: .15,
		descKey: "struct.hub"
	},
	solar: {
		id: "solar",
		unlock: "nrg_pv",
		cost: { minerals: 8 },
		icon: "☀",
		color: [
			.75,
			.65,
			.35
		],
		y: { eProd: 2.2 },
		req: (t) => t.elev <= 3,
		reqKey: "req.lowland",
		pollution: 0,
		descKey: "struct.solar",
		forbidBiome: ["ocean", "river"]
	},
	battery: {
		id: "battery",
		unlock: "nrg_grid",
		cost: {
			minerals: 10,
			energy: 4
		},
		icon: "▣",
		color: [
			.5,
			.55,
			.68
		],
		y: { eProd: .3 },
		req: null,
		reqKey: "",
		pollution: .05,
		descKey: "struct.battery"
	},
	extractor: {
		id: "extractor",
		unlock: null,
		cost: {
			minerals: 9,
			energy: 3
		},
		icon: "↊",
		color: [
			.45,
			.6,
			.66
		],
		y: {
			wProd: 2.6,
			eUse: .8,
			dPoll: .1
		},
		req: (t, _g, _i, ctx) => t.moist >= 30 || hasWaterNeighbor(ctx),
		reqKey: "req.ice",
		pollution: .1,
		descKey: "struct.extractor"
	},
	mine: {
		id: "mine",
		unlock: "geo_drill",
		cost: {
			minerals: 6,
			energy: 4
		},
		icon: "⛏",
		color: [
			.55,
			.47,
			.4
		],
		y: {
			mProd: 3.2,
			eUse: .6,
			dPoll: .5,
			fertAdd: -6
		},
		req: (t) => t.dep >= 2,
		reqKey: "req.richdeposit",
		pollution: .5,
		descKey: "struct.mine",
		forbidBiome: [
			"ocean",
			"river",
			"ecozone",
			"wetland"
		]
	},
	geo: {
		id: "geo",
		unlock: "nrg_geo",
		cost: { minerals: 14 },
		icon: "♨",
		color: [
			.66,
			.42,
			.32
		],
		y: {
			eProd: 3.6,
			dPoll: .6,
			dT: .04
		},
		req: (t) => t.geo === 1,
		reqKey: "req.geothermal",
		pollution: .6,
		descKey: "struct.geo"
	},
	research: {
		id: "research",
		unlock: null,
		cost: {
			minerals: 10,
			energy: 4
		},
		icon: "⚗",
		color: [
			.52,
			.55,
			.72
		],
		y: {
			rp: 2.2,
			eUse: 1
		},
		req: null,
		reqKey: "",
		pollution: .05,
		descKey: "struct.research"
	},
	atmos: {
		id: "atmos",
		unlock: "atm_processor",
		cost: {
			minerals: 16,
			energy: 6
		},
		icon: "⇪",
		color: [
			.56,
			.66,
			.72
		],
		y: {
			dO2: 1.6,
			dH: .6,
			eUse: 2,
			dT: .08
		},
		req: (t) => t.elev <= 3,
		reqKey: "req.lowland",
		pollution: .1,
		descKey: "struct.atmos"
	},
	biodivlab: {
		id: "biodivlab",
		unlock: "bio_diversity",
		cost: {
			minerals: 12,
			biomass: 6,
			energy: 4
		},
		icon: "❈",
		color: [
			.4,
			.66,
			.5
		],
		y: {
			rp: .8,
			bio: .6,
			eUse: .6
		},
		req: null,
		reqKey: "",
		pollution: 0,
		descKey: "struct.biodivlab"
	},
	weather: {
		id: "weather",
		unlock: "atm_control",
		cost: {
			minerals: 14,
			energy: 8
		},
		icon: "⛆",
		color: [
			.48,
			.62,
			.75
		],
		y: {
			eUse: 1.4,
			dH: .8,
			moistAdd: 2
		},
		req: null,
		reqKey: "",
		pollution: 0,
		descKey: "struct.weather"
	},
	habitat: {
		id: "habitat",
		unlock: "hab_prefab",
		cost: {
			minerals: 14,
			energy: 3,
			water: 6
		},
		icon: "⌾",
		color: [
			.7,
			.66,
			.58
		],
		y: {
			rp: .5,
			eUse: .8,
			wUse: 1,
			dPoll: .2
		},
		req: null,
		reqKey: "",
		pollution: .15,
		descKey: "struct.habitat",
		forbidBiome: [
			"ocean",
			"river",
			"alpine"
		]
	}
};
var TECH_BRANCHES = [
	"geology",
	"hydrology",
	"biology",
	"atmosphere",
	"energy",
	"habitats"
];
var TECHS = {};
function tech(d) {
	TECHS[d.id] = {
		mods: [],
		...d
	};
}
tech({
	id: "geo_drill",
	branch: "geology",
	tier: 1,
	cost: 34,
	reqs: [],
	icon: "⛏",
	descKey: "tech.geo_drill",
	mods: [{
		kind: "unlockStructure",
		target: "mine",
		val: 1
	}]
});
tech({
	id: "geo_seismic",
	branch: "geology",
	tier: 2,
	cost: 58,
	reqs: ["geo_drill"],
	icon: "◫",
	descKey: "tech.geo_seismic",
	mods: [{
		kind: "unlockBiome",
		target: "mineralfield",
		val: 1
	}, {
		kind: "prodMult",
		target: "minerals",
		val: 1.15
	}]
});
tech({
	id: "geo_orogeny",
	branch: "geology",
	tier: 3,
	cost: 96,
	reqs: ["geo_seismic"],
	icon: "▲",
	descKey: "tech.geo_orogeny",
	mods: [{
		kind: "unlockBiome",
		target: "alpine",
		val: 1
	}, {
		kind: "climate",
		target: "rainBoost",
		val: .15
	}]
});
tech({
	id: "geo_mantle",
	branch: "geology",
	tier: 4,
	cost: 150,
	reqs: ["geo_orogeny"],
	icon: "☊",
	descKey: "tech.geo_mantle",
	mods: [{
		kind: "prodMult",
		target: "minerals",
		val: 1.2
	}, {
		kind: "climate",
		target: "volcRisk",
		val: -.5
	}]
});
tech({
	id: "hyd_rivers",
	branch: "hydrology",
	tier: 1,
	cost: 36,
	reqs: [],
	icon: "∿",
	descKey: "tech.hyd_rivers",
	mods: [{
		kind: "unlockBiome",
		target: "river",
		val: 1
	}]
});
tech({
	id: "hyd_aquifer",
	branch: "hydrology",
	tier: 2,
	cost: 62,
	reqs: ["hyd_rivers"],
	icon: "ↆ",
	descKey: "tech.hyd_aquifer",
	mods: [{
		kind: "prodMult",
		target: "water",
		val: 1.25
	}, {
		kind: "climate",
		target: "moistDrift",
		val: .4
	}]
});
tech({
	id: "hyd_seedcloud",
	branch: "hydrology",
	tier: 3,
	cost: 104,
	reqs: ["hyd_aquifer"],
	icon: "☁",
	descKey: "tech.hyd_seedcloud",
	mods: [{
		kind: "climate",
		target: "rainBoost",
		val: .2
	}, {
		kind: "unlockStructure",
		target: "weather",
		val: 1
	}]
});
tech({
	id: "hyd_comet",
	branch: "hydrology",
	tier: 4,
	cost: 168,
	reqs: ["hyd_seedcloud"],
	icon: "☄",
	descKey: "tech.hyd_comet",
	mods: [{
		kind: "prodMult",
		target: "water",
		val: 1.3
	}, {
		kind: "climate",
		target: "oceanFill",
		val: 6
	}]
});
tech({
	id: "bio_lichen",
	branch: "biology",
	tier: 1,
	cost: 30,
	reqs: [],
	icon: "❋",
	descKey: "tech.bio_lichen",
	mods: [{
		kind: "unlockBiome",
		target: "wetland",
		val: 1
	}, {
		kind: "biomeCostMult",
		target: "tundra",
		val: .8
	}]
});
tech({
	id: "bio_mycorrhiza",
	branch: "biology",
	tier: 2,
	cost: 56,
	reqs: ["bio_lichen"],
	icon: "❂",
	descKey: "tech.bio_mycorrhiza",
	mods: [{
		kind: "climate",
		target: "netLinkBoost",
		val: .2
	}, {
		kind: "biomeCostMult",
		target: "forest",
		val: .85
	}]
});
tech({
	id: "bio_canopy",
	branch: "biology",
	tier: 3,
	cost: 100,
	reqs: ["bio_mycorrhiza"],
	icon: "❖",
	descKey: "tech.bio_canopy",
	mods: [{
		kind: "unlockBiome",
		target: "tropical",
		val: 1
	}, {
		kind: "bioMult",
		val: 1.15
	}]
});
tech({
	id: "bio_diversity",
	branch: "biology",
	tier: 4,
	cost: 158,
	reqs: ["bio_canopy"],
	icon: "⚛",
	descKey: "tech.bio_diversity",
	mods: [{
		kind: "unlockStructure",
		target: "biodivlab",
		val: 1
	}, {
		kind: "bioMult",
		val: 1.2
	}]
});
tech({
	id: "atm_greenhouse",
	branch: "atmosphere",
	tier: 1,
	cost: 34,
	reqs: [],
	icon: "♨",
	descKey: "tech.atm_greenhouse",
	mods: [{
		kind: "climate",
		target: "greenhouse",
		val: .25
	}, {
		kind: "climate",
		target: "greenhouseBase",
		val: .06
	}]
});
tech({
	id: "atm_processor",
	branch: "atmosphere",
	tier: 2,
	cost: 64,
	reqs: ["atm_greenhouse"],
	icon: "⇪",
	descKey: "tech.atm_processor",
	mods: [{
		kind: "unlockStructure",
		target: "atmos",
		val: 1
	}, {
		kind: "climate",
		target: "o2Boost",
		val: .2
	}]
});
tech({
	id: "atm_pressure",
	branch: "atmosphere",
	tier: 3,
	cost: 108,
	reqs: ["atm_processor"],
	icon: "⊙",
	descKey: "tech.atm_pressure",
	mods: [{
		kind: "climate",
		target: "pressureGain",
		val: .35
	}, {
		kind: "climate",
		target: "tempDrift",
		val: -.04
	}]
});
tech({
	id: "atm_control",
	branch: "atmosphere",
	tier: 4,
	cost: 165,
	reqs: ["atm_pressure"],
	icon: "◍",
	descKey: "tech.atm_control",
	mods: [{
		kind: "eventGoodMult",
		val: 1.5
	}, {
		kind: "climate",
		target: "disasterShield",
		val: .4
	}]
});
tech({
	id: "nrg_pv",
	branch: "energy",
	tier: 1,
	cost: 32,
	reqs: [],
	icon: "☀",
	descKey: "tech.nrg_pv",
	mods: [{
		kind: "unlockStructure",
		target: "solar",
		val: 1
	}]
});
tech({
	id: "nrg_grid",
	branch: "energy",
	tier: 2,
	cost: 58,
	reqs: ["nrg_pv"],
	icon: "▣",
	descKey: "tech.nrg_grid",
	mods: [
		{
			kind: "unlockStructure",
			target: "battery",
			val: 1
		},
		{
			kind: "softCapAdd",
			target: "energy",
			val: 60
		},
		{
			kind: "prodMult",
			target: "energy",
			val: 1.1
		}
	]
});
tech({
	id: "nrg_geo",
	branch: "energy",
	tier: 3,
	cost: 102,
	reqs: ["nrg_grid"],
	icon: "♨",
	descKey: "tech.nrg_geo",
	mods: [{
		kind: "unlockStructure",
		target: "geo",
		val: 1
	}, {
		kind: "prodMult",
		target: "energy",
		val: 1.15
	}]
});
tech({
	id: "nrg_fusion",
	branch: "energy",
	tier: 4,
	cost: 170,
	reqs: ["nrg_geo"],
	icon: "✦",
	descKey: "tech.nrg_fusion",
	mods: [{
		kind: "prodMult",
		target: "energy",
		val: 1.3
	}, {
		kind: "climate",
		target: "tempDrift",
		val: -.03
	}]
});
tech({
	id: "hab_prefab",
	branch: "habitats",
	tier: 1,
	cost: 40,
	reqs: [],
	icon: "⌾",
	descKey: "tech.hab_prefab",
	mods: [{
		kind: "unlockStructure",
		target: "habitat",
		val: 1
	}, {
		kind: "rangeAdd",
		val: 1
	}]
});
tech({
	id: "hab_expansion",
	branch: "habitats",
	tier: 2,
	cost: 70,
	reqs: ["hab_prefab"],
	icon: "⧉",
	descKey: "tech.hab_expansion",
	mods: [{
		kind: "rangeAdd",
		val: 2
	}]
});
tech({
	id: "hab_arcology",
	branch: "habitats",
	tier: 3,
	cost: 115,
	reqs: ["hab_expansion"],
	icon: "⌬",
	descKey: "tech.hab_arcology",
	mods: [{
		kind: "prodMult",
		target: "research",
		val: 1.25
	}, {
		kind: "pollutionMult",
		val: .8
	}]
});
tech({
	id: "hab_terra",
	branch: "habitats",
	tier: 4,
	cost: 178,
	reqs: ["hab_arcology", "bio_diversity"],
	icon: "✳",
	descKey: "tech.hab_terra",
	mods: [{
		kind: "unlockBiome",
		target: "ecozone",
		val: 1
	}, {
		kind: "bioMult",
		val: 1.25
	}]
});
var STARTER_TECHS = [];
/** Structures available from cycle 1 (research station is a starting build too). */
var FREE_STRUCTURES = ["extractor", "research"];
var COMBOS = [
	{
		id: "watershed",
		requires: [
			"alpine",
			"forest",
			"river"
		],
		bonus: {
			wProd: .6,
			bio: 1.5
		},
		descKey: "combo.watershed"
	},
	{
		id: "thriving",
		requires: [
			"forest",
			"wetland",
			"river"
		],
		bonus: {
			bio: 2.2,
			dO2: .25
		},
		descKey: "combo.thriving"
	},
	{
		id: "grid",
		requires: ["grassland"],
		bonus: {
			eProd: .8,
			rp: .4
		},
		descKey: "combo.grid"
	},
	{
		id: "hotspot",
		requires: [
			"forest",
			"wetland",
			"grassland",
			"river"
		],
		bonus: {
			bio: 3.2,
			rp: .5
		},
		descKey: "combo.hotspot"
	},
	{
		id: "oasisis",
		requires: ["river", "grassland"],
		bonus: {
			bio: 1.2,
			wProd: .4
		},
		descKey: "combo.oasisis"
	}
];
/** battery/solar structures must be neighbors for the grid combo */
var GRID_COMBO_STRUCTS = ["solar", "battery"];
function biomeColorHex(id) {
	const [r, g, b] = BIOMES[id].color;
	const c = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
	return `#${c(r)}${c(g)}${c(b)}`;
}
function scaleCost(cost, m) {
	const out = {};
	for (const k of RES_IDS) {
		const v = cost[k];
		if (v) out[k] = Math.max(1, Math.round(v * m));
	}
	return { cost: out };
}
function costText(cost) {
	const icons = {
		water: "💧",
		minerals: "⛁",
		energy: "⚡",
		biomass: "❧",
		research: "◉"
	};
	return RES_IDS.filter((k) => cost[k]).map((k) => `${icons[k]}${cost[k]}`).join(" ");
}
//#endregion
//#region src/core/hex.ts
function hexKey(q, r) {
	return `${q},${r}`;
}
function hexDistance(a, b) {
	const dq = a.q - b.q;
	const dr = a.r - b.r;
	return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}
/** All tile keys of a hexagonal map of `radius`. Deterministic order (r, then q). */
function hexMapCoords(radius) {
	const out = [];
	for (let r = -radius; r <= radius; r++) {
		const qMin = Math.max(-radius, -r - radius);
		const qMax = Math.min(radius, -r + radius);
		for (let q = qMin; q <= qMax; q++) out.push({
			q,
			r
		});
	}
	return out;
}
//#endregion
//#region src/core/rng.ts
/**
* Deterministic RNG utilities.
* The whole simulation draws randomness exclusively from RngState, which is
* fully serialized into save games. Given the same state and the same action
* sequence, the sim always produces the same result.
*/
/** mulberry32 hash of an arbitrary string → uint32 seed. */
function hashString(str) {
	let h = 2166136261;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	return h >>> 0;
}
/** One step of mulberry32 (used for stateless hashing helpers). */
function mulberry32Next(a) {
	a = a + 1831565813 | 0;
	let t = Math.imul(a ^ a >>> 15, 1 | a);
	t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
	return [((t ^ t >>> 14) >>> 0) / 4294967296, a];
}
function seedRng(seed) {
	let x = (typeof seed === "number" ? seed >>> 0 : hashString(seed)) >>> 0;
	const next = () => {
		x = x + 2654435769 | 0;
		let t = x;
		t = Math.imul(t ^ t >>> 16, 569420461) >>> 0;
		t = Math.imul(t ^ t >>> 15, 1935289751) >>> 0;
		return (t ^ t >>> 15) >>> 0;
	};
	const st = {
		a: next(),
		b: next(),
		c: next(),
		d: next()
	};
	for (let i = 0; i < 12; i++) rngFloat(st);
	return st;
}
/** Returns [float 0..1, newState]. Pure: the caller keeps the returned state. */
function rngFloat(st) {
	let { a, b, c, d } = st;
	d = d + 1 | 0;
	const t = a + b | 0;
	a = b ^ b >>> 9;
	b = c + (c << 3) | 0;
	c = c << 21 | c >>> 11 | 0;
	c = c + t | 0;
	d = d + t | 0;
	return [(d >>> 0) / 4294967296, {
		a: a >>> 0,
		b: b >>> 0,
		c: c >>> 0,
		d: d >>> 0
	}];
}
/** Integer in [0, max). */
function rngInt(st, max) {
	const [f, s] = rngFloat(st);
	return [Math.floor(f * max), s];
}
/** Stateless 2D value hash in [0,1] — for procedural textures on the grid. */
function hash2d(seed, x, y) {
	let h = seed >>> 0;
	h = Math.imul(h ^ x * 2654435769 + 2246822507, 3266489909);
	h ^= h >>> 13;
	h = Math.imul(h ^ y * 2246822507 + 668265263, 374761393);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
}
/** Smooth value noise on axial hex coords (deterministic, cheap). */
function hexNoise(seed, q, r, scale) {
	const x = q / scale;
	const y = r / scale;
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const xf = x - xi;
	const yf = y - yi;
	const s = (n) => n * n * (3 - 2 * n);
	const u = s(xf);
	const v = s(yf);
	const a = hash2d(seed, xi, yi);
	const b = hash2d(seed, xi + 1, yi);
	const c = hash2d(seed, xi, yi + 1);
	const d2 = hash2d(seed, xi + 1, yi + 1);
	return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d2 * u) * v;
}
/** Fractal hex noise, 3 octaves, [0,1]. */
function fbmHex(seed, q, r, baseScale = 7) {
	let amp = 1;
	let total = 0;
	let norm = 0;
	let scale = baseScale;
	for (let i = 0; i < 3; i++) {
		total += hexNoise(seed + i * 7919, q, r, scale) * amp;
		norm += amp;
		amp *= .5;
		scale *= .45;
	}
	return total / norm;
}
//#endregion
//#region src/sim/state.ts
/**
* Game state helpers: construction, indices, territory, tech aggregation.
*/
var SAVE_VERSION = 3;
function coordsOf(mapR) {
	return hexMapCoords(mapR);
}
function makeTile() {
	return {
		elev: 2,
		biome: "barren",
		dev: 0,
		moist: 0,
		fert: 0,
		poll: 0,
		dep: 0,
		geo: 0,
		structure: null,
		tTf: 0,
		suit: 0
	};
}
function blankState(seed, mode, mapR, planetName) {
	const n = 3 * mapR * (mapR + 1) + 1;
	const tiles = [];
	for (let i = 0; i < n; i++) tiles.push(makeTile());
	return {
		version: 3,
		seed,
		mode,
		mapR,
		hubIndex: 0,
		rng: seedRng(seed),
		cycle: 1,
		tiles,
		inTerritory: new Array(n).fill(0),
		planet: {
			temp: -24,
			water: 8,
			oxygen: 4,
			humidity: 6,
			bio: 0,
			pressure: 12,
			fert: 2,
			stability: 8,
			pollution: 0
		},
		res: {
			water: 18,
			minerals: 22,
			energy: 10,
			biomass: 0,
			research: 8
		},
		techCurrent: null,
		techDone: [],
		techProgress: 0,
		modifiers: [],
		pendingChoice: null,
		recentEvents: [],
		objectives: [],
		stableCycles: 0,
		crisis: 0,
		stats: {
			placed: 0,
			structures: 0,
			combos: 0,
			eventsSeen: 0,
			decisionsMade: 0,
			peakBio: 0,
			peakWater: 0,
			techs: 0,
			tilesLost: 0
		},
		phase: 1,
		score: 0,
		end: null,
		combos: [],
		snapshots: [],
		planetName
	};
}
/** Shared coord/key lookups per map radius. */
var indexCache = /* @__PURE__ */ new Map();
function mapIndex(mapR) {
	let e = indexCache.get(mapR);
	if (!e) {
		const coords = coordsOf(mapR);
		const keyToIdx = /* @__PURE__ */ new Map();
		coords.forEach((h, i) => keyToIdx.set(hexKey(h.q, h.r), i));
		e = {
			coords,
			keyToIdx
		};
		indexCache.set(mapR, e);
	}
	return e;
}
function tileHex(g, i) {
	return mapIndex(g.mapR).coords[i];
}
function tileIdxByKey(g, key) {
	const i = mapIndex(g.mapR).keyToIdx.get(key);
	return i === void 0 ? -1 : i;
}
var NEI_KEYS = (() => {
	return [];
})();
var neiCache = /* @__PURE__ */ new Map();
/** Neighbor tile indices for every tile index. */
function neighborsIdx(mapR) {
	let n = neiCache.get(mapR);
	if (!n) {
		const { coords, keyToIdx } = mapIndex(mapR);
		n = coords.map((h) => {
			const out = [];
			for (const d of DIRS6) {
				const i = keyToIdx.get(hexKey(h.q + d[0], h.r + d[1]));
				if (i !== void 0) out.push(i);
			}
			return out;
		});
		neiCache.set(mapR, n);
	}
	return n;
}
var DIRS6 = [
	[1, 0],
	[1, -1],
	[0, -1],
	[-1, 0],
	[-1, 1],
	[0, 1]
];
/** Tiles within distance d (inclusive) of tile i. */
var ringCache = /* @__PURE__ */ new Map();
function withinDist(mapR, i, d) {
	const ck = `${mapR}:${i}:${d}`;
	let r = ringCache.get(ck);
	if (!r) {
		const { coords } = mapIndex(mapR);
		const h = coords[i];
		r = [];
		for (let j = 0; j < coords.length; j++) if (hexDistance(h, coords[j]) <= d) r.push(j);
		ringCache.set(ck, r);
	}
	return r;
}
/** Territory = tiles within range of the hub or any habitat. */
function computeTerritory(g, range) {
	const { coords } = mapIndex(g.mapR);
	const nei = neighborsIdx(g.mapR);
	const n = g.tiles.length;
	g.inTerritory = new Array(n).fill(0);
	const centers = [];
	for (let i = 0; i < n; i++) if (g.tiles[i].structure === "hub" || g.tiles[i].structure === "habitat") centers.push(i);
	if (centers.length === 0) centers.push(tIdxOfNearest(g, 0, 0));
	const dist = new Array(n).fill(Infinity);
	const queue = [];
	for (const c of centers) {
		dist[c] = 0;
		g.inTerritory[c] = 1;
		queue.push(c);
	}
	let head = 0;
	while (head < queue.length) {
		const cur = queue[head++];
		if (dist[cur] >= range) continue;
		for (const nb of nei[cur]) if (dist[nb] > dist[cur] + 1) {
			dist[nb] = dist[cur] + 1;
			g.inTerritory[nb] = 1;
			queue.push(nb);
		}
	}
}
function tIdxOfNearest(g, q, r) {
	const { coords } = mapIndex(g.mapR);
	let best = 0;
	let bd = Infinity;
	for (let i = 0; i < coords.length; i++) {
		const d = hexDistance(coords[i], {
			q,
			r
		});
		if (d < bd) {
			bd = d;
			best = i;
		}
	}
	return best;
}
function aggregateTechs(g) {
	const agg = {
		biomeCostMult: {},
		structCostMult: 1,
		prodMult: {},
		unlockedBiomes: /* @__PURE__ */ new Set(),
		unlockedStructures: /* @__PURE__ */ new Set(),
		rangeAdd: 0,
		climate: {},
		softCapAdd: {},
		bioMult: 1,
		pollutionMult: 1,
		eventGoodMult: 1
	};
	for (const id of g.techDone) {
		const def = TECHS[id];
		if (!def) continue;
		for (const m of def.mods) applyMod(agg, m);
	}
	return agg;
}
function applyMod(agg, m) {
	switch (m.kind) {
		case "biomeCostMult":
			agg.biomeCostMult[m.target] = (agg.biomeCostMult[m.target] ?? 1) * m.val;
			break;
		case "structCostMult":
			agg.structCostMult *= m.val;
			break;
		case "prodMult":
			agg.prodMult[m.target] = (agg.prodMult[m.target] ?? 1) * m.val;
			break;
		case "unlockBiome":
			agg.unlockedBiomes.add(m.target);
			break;
		case "unlockStructure":
			agg.unlockedStructures.add(m.target);
			break;
		case "rangeAdd":
			agg.rangeAdd += m.val;
			break;
		case "climate":
			agg.climate[m.target] = (agg.climate[m.target] ?? 0) + m.val;
			break;
		case "softCapAdd":
			agg.softCapAdd[m.target] = (agg.softCapAdd[m.target] ?? 0) + m.val;
			break;
		case "bioMult":
			agg.bioMult *= m.val;
			break;
		case "pollutionMult":
			agg.pollutionMult *= m.val;
			break;
		case "eventGoodMult": agg.eventGoodMult *= m.val;
	}
}
function biomeIndex(b) {
	return BIOME_ORDER.indexOf(b);
}
function rngOf(g) {
	return g.rng;
}
function setRng(g, s) {
	g.rng = {
		a: s.a,
		b: s.b,
		c: s.c,
		d: s.d
	};
}
/** Cheap deterministic hash of the whole state (for determinism tests). */
function stateHash(g) {
	let h = 2166136261;
	const mix = (x) => {
		h ^= Math.round(x * 1e3) | 0;
		h = Math.imul(h, 16777619) >>> 0;
	};
	mix(g.cycle);
	mix(g.planet.temp);
	mix(g.planet.oxygen);
	mix(g.planet.humidity);
	mix(g.planet.bio);
	mix(g.planet.water);
	mix(g.planet.pressure);
	mix(g.planet.fert);
	mix(g.planet.stability);
	mix(g.planet.pollution);
	mix(g.res.water);
	mix(g.res.minerals);
	mix(g.res.energy);
	mix(g.res.biomass);
	mix(g.res.research);
	for (const t of g.tiles) {
		mix(biomeIndex(t.biome));
		mix(t.dev);
		mix(t.moist);
		mix(t.fert);
		mix(t.poll);
		mix(t.elev);
		mix(t.structure ? 1 : 0);
	}
	mix(g.rng.a);
	mix(g.rng.b);
	mix(g.rng.c);
	mix(g.rng.d);
	mix(g.techProgress);
	return h.toString(16);
}
//#endregion
//#region src/sim/snapshot.ts
/**
* Lightweight planet snapshots — every few cycles we record biome+dev per
* tile. The end-of-game report replays these to show the planet transforming
* from barren to alive (the emotional payoff).
*/
function pushSnapshot(g, force = false) {
	const frame = {
		cycle: g.cycle,
		b: g.tiles.map((t) => BIOME_ORDER.indexOf(t.biome)),
		d: g.tiles.map((t) => t.dev)
	};
	if (!force && g.snapshots.some((f) => f.cycle === g.cycle)) return;
	g.snapshots.push(frame);
	while (g.snapshots.length > 48) {
		const keep = [];
		for (let i = 0; i < g.snapshots.length; i++) if (i % 2 === 0 || i === g.snapshots.length - 1) keep.push(g.snapshots[i]);
		g.snapshots = keep;
	}
}
/** Interpolate between snapshot frames at a given cycle for the replay. */
function snapshotAt(g, cycle) {
	const snaps = g.snapshots;
	if (snaps.length === 0) return {
		b: [],
		d: []
	};
	if (cycle <= snaps[0].cycle) return snaps[0];
	if (cycle >= snaps[snaps.length - 1].cycle) return snaps[snaps.length - 1];
	let lo = 0;
	while (lo < snaps.length - 1 && snaps[lo + 1].cycle < cycle) lo++;
	const a = snaps[lo];
	const b = snaps[lo + 1] ?? a;
	const span = Math.max(1, b.cycle - a.cycle);
	const f = Math.max(0, Math.min(1, (cycle - a.cycle) / span));
	return {
		b: a.b.map((x, i) => f < .5 ? x : b.b[i]),
		d: a.d.map((x, i) => Math.round(x + (b.d[i] - x) * f))
	};
}
//#endregion
//#region src/sim/objectives.ts
/**
* Objectives — the primary goal plus 3 random optional goals per run.
* prog() returns 0..1 for progress bars; done when >= 1.
*/
function countBiome$1(g, b, devMin = 0) {
	return g.tiles.filter((t) => t.biome === b && t.dev >= devMin).length;
}
var OBJECTIVE_POOL = [
	{
		id: "bio70",
		bonus: 1200,
		prog: (g) => g.planet.bio / 70
	},
	{
		id: "green_industry",
		bonus: 1e3,
		prog: (g) => Math.min(1, Math.min(g.planet.pollution <= 12 ? 1 : 1 - (g.planet.pollution - 12) / 25, g.planet.bio >= 40 ? 1 : g.planet.bio / 40))
	},
	{
		id: "three_watersheds",
		bonus: 900,
		prog: (g) => Math.min(1, g.combos.filter((c) => c.id === "watershed").length / 3)
	},
	{
		id: "five_forests",
		bonus: 700,
		prog: (g) => Math.min(1, countBiome$1(g, "forest", 2) / 5)
	},
	{
		id: "temp_band",
		bonus: 800,
		prog: (g) => g.planet.temp >= -2 && g.planet.temp <= 22 ? 1 : .5
	},
	{
		id: "great_corridor",
		bonus: 1100,
		prog: (g) => Math.min(1, biggestNetwork(g) / 14)
	},
	{
		id: "power_grid",
		bonus: 800,
		prog: (g) => Math.min(1, g.tiles.filter((t) => t.structure === "solar").length / 4 + g.tiles.filter((t) => t.structure === "battery").length / 2)
	},
	{
		id: "three_habitats",
		bonus: 700,
		prog: (g) => Math.min(1, countBiome2(g, "habitat") / 3)
	},
	{
		id: "tech12",
		bonus: 900,
		prog: (g) => Math.min(1, g.techDone.length / 12)
	},
	{
		id: "ocean_seven",
		bonus: 600,
		prog: (g) => Math.min(1, (countBiome$1(g, "ocean") + countBiome$1(g, "river") * .5) / 9)
	},
	{
		id: "balanced_world",
		bonus: 1300,
		prog: (g) => {
			const kinds = new Set(g.tiles.filter((t) => t.dev > 0).map((t) => t.biome));
			return Math.min(1, kinds.size / 7);
		}
	}
];
function countBiome2(g, s) {
	return g.tiles.filter((t) => t.structure === s).length;
}
function biggestNetwork(g) {
	const LIVING = /* @__PURE__ */ new Set([
		"grassland",
		"forest",
		"wetland",
		"river",
		"tropical",
		"ecozone",
		"tundra",
		"alpine"
	]);
	const nei = neighborsIdx(g.mapR);
	const seen = new Uint8Array(g.tiles.length);
	let best = 0;
	for (let i = 0; i < g.tiles.length; i++) {
		if (seen[i] || !LIVING.has(g.tiles[i].biome) || g.tiles[i].dev <= 0) continue;
		let size = 0;
		const stack = [i];
		seen[i] = 1;
		while (stack.length) {
			const c = stack.pop();
			size++;
			for (const nb of nei[c]) if (!seen[nb] && LIVING.has(g.tiles[nb].biome) && g.tiles[nb].dev > 0) {
				seen[nb] = 1;
				stack.push(nb);
			}
		}
		best = Math.max(best, size);
	}
	return best;
}
function getObjective(id) {
	if (id === "primary_self_sustaining") return PRIMARY;
	return OBJECTIVE_POOL.find((o) => o.id === id);
}
var PRIMARY = {
	id: "primary_self_sustaining",
	bonus: 2500,
	prog: (g) => {
		const p = g.planet;
		const q = (v, target) => Math.min(1, v / target);
		return (q(p.stability, 65) + q(p.bio, 55) + q(p.oxygen, 16) + q(p.water, 50) + q(Math.max(0, 30 - p.pollution), 25)) / 5;
	}
};
function primaryMet(g) {
	const p = g.planet;
	return p.stability >= 65 && p.bio >= 55 && p.oxygen >= 16 && p.water >= 50 && p.pollution <= 30;
}
//#endregion
//#region src/sim/generation.ts
/**
* Procedural, seeded planet generation with balance guarantees:
* always enough starting water, deposits and viable first moves.
*/
var MODE_CFG = {
	standard: {
		iceCount: 3,
		basinCount: 2,
		moistBias: 0,
		tempStart: -16,
		depBias: 0,
		geoBias: 0,
		resMult: 1,
		techStart: null
	},
	arid: {
		iceCount: 1,
		basinCount: 1,
		moistBias: -18,
		tempStart: -8,
		depBias: .02,
		geoBias: 0,
		resMult: .9,
		techStart: null
	},
	frozen: {
		iceCount: 6,
		basinCount: 1,
		moistBias: 10,
		tempStart: -48,
		depBias: -.01,
		geoBias: 0,
		resMult: 1,
		techStart: null
	},
	volcanic: {
		iceCount: 2,
		basinCount: 2,
		moistBias: 0,
		tempStart: -10,
		depBias: .04,
		geoBias: .06,
		resMult: 1.05,
		techStart: null
	},
	ecological: {
		iceCount: 3,
		basinCount: 2,
		moistBias: 6,
		tempStart: -18,
		depBias: -.02,
		geoBias: -.03,
		resMult: 1,
		techStart: "bio_lichen"
	},
	hardcore: {
		iceCount: 2,
		basinCount: 1,
		moistBias: -6,
		tempStart: -22,
		depBias: 0,
		geoBias: 0,
		resMult: .62,
		techStart: null
	},
	daily: {
		iceCount: 3,
		basinCount: 2,
		moistBias: 0,
		tempStart: -16,
		depBias: 0,
		geoBias: 0,
		resMult: 1,
		techStart: null
	}
};
var NAME_A = [
	"Kepler",
	"Aurel",
	"Nyx",
	"Talos",
	"Vesper",
	"Ceres",
	"Onyx",
	"Rhea",
	"Pallas",
	"Iju",
	"Kalo",
	"Mira",
	"Erid",
	"Solara",
	"Tycho",
	"Umbra",
	"Viva",
	"Xan"
];
var NAME_B = [
	"-9b",
	"-IV",
	"-Prime",
	" Minor",
	" Major",
	"-c",
	" VII",
	"-IX",
	" Dawn",
	".2",
	" Reach",
	"-3"
];
function planetNameFor(seed) {
	let h = 0;
	for (let i = 0; i < seed.length; i++) h = Math.imul(h, 31) + seed.charCodeAt(i) | 0;
	let s = h >>> 0;
	let a, b;
	[a, s] = mulberry32Next(s);
	[b, s] = mulberry32Next(s);
	return NAME_A[Math.floor(a * NAME_A.length)] + NAME_B[Math.floor(b * NAME_B.length)];
}
function seedNum(seed) {
	let h = 2654435769;
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i);
		h = Math.imul(h, 2246822507) >>> 0;
	}
	return h >>> 0;
}
var DIR6 = [
	[1, 0],
	[1, -1],
	[0, -1],
	[-1, 0],
	[-1, 1],
	[0, 1]
];
function neighborsOfIdx(g, i) {
	const { coords, keyToIdx } = mapIndex(g.mapR);
	const h = coords[i];
	const out = [];
	for (const d of DIR6) {
		const j = keyToIdx.get(hexKey(h.q + d[0], h.r + d[1]));
		if (j !== void 0) out.push(j);
	}
	return out;
}
function withinRing(g, i, d) {
	const { coords } = mapIndex(g.mapR);
	const h = coords[i];
	const out = [];
	for (let j = 0; j < coords.length; j++) if (hexDistance(coords[j], h) <= d) out.push(j);
	return out;
}
function generatePlanet(g) {
	const cfg = MODE_CFG[g.mode];
	const { coords } = mapIndex(g.mapR);
	const n = g.tiles.length;
	const S = seedNum(g.seed);
	const rng = { ...g.rng };
	let hub = 0;
	let bestScore = -Infinity;
	const centerBand = g.mapR * 2 / 3;
	for (let i = 0; i < n; i++) {
		const h = coords[i];
		const distC = hexDistance(h, {
			q: 0,
			r: 0
		});
		if (distC > centerBand) continue;
		const e = Math.round(fbmHex(S + 11, h.q, h.r, 6) * 5);
		const sc = -distC * 2 - Math.abs(e - 2) * 6 + hash2d(S, h.q, h.r) * 2;
		if (sc > bestScore) {
			bestScore = sc;
			hub = i;
		}
	}
	for (let i = 0; i < n; i++) {
		const h = coords[i];
		const t = g.tiles[i];
		const cont = fbmHex(S + 1, h.q, h.r, 11);
		const detail = fbmHex(S + 2, h.q, h.r, 4.5);
		let elev = cont * 4.4 + detail * 1.8 - .55;
		elev += Math.max(0, hexDistance(h, {
			q: 0,
			r: 0
		}) - (g.mapR - 3)) * .5;
		t.elev = Math.max(0, Math.min(5, Math.round(elev)));
		t.moist = Math.max(0, Math.min(100, (t.elev <= 1 ? 30 : t.elev === 2 ? 12 : 6) + fbmHex(S + 3, h.q, h.r, 7) * 30 + cfg.moistBias + hash2d(S + 4, h.q, h.r) * 12));
		t.fert = Math.max(0, Math.min(100, fbmHex(S + 5, h.q, h.r, 8) * 42 + (t.elev === 2 ? 8 : 0) + hash2d(S + 6, h.q, h.r) * 10 - 6));
		const depRoll = hash2d(S + 7, h.q * 3 + 1, h.r * 5 + 2);
		t.dep = depRoll < .02 + cfg.depBias ? 3 : depRoll < .06 + cfg.depBias ? 2 : depRoll < .12 + cfg.depBias ? 1 : 0;
		t.geo = hash2d(S + 8, h.q * 7 + 3, h.r * 9 + 5) < .022 + cfg.geoBias || t.elev >= 4 && hash2d(S + 9, h.q, h.r) < .05 + cfg.geoBias ? 1 : 0;
		t.biome = "barren";
		t.suit = 0;
		t.dev = 0;
		t.poll = 0;
		t.structure = null;
		t.tTf = 0;
	}
	let icePlaced = 0;
	const rimOrder = [...Array(n).keys()].sort((a, b) => hexDistance(coords[b], {
		q: 0,
		r: 0
	}) - hexDistance(coords[a], {
		q: 0,
		r: 0
	}));
	for (const i of rimOrder) {
		if (icePlaced >= cfg.iceCount) break;
		const t = g.tiles[i];
		if (t.elev <= 2 && hash2d(S + 12, coords[i].q, coords[i].r) > .35) {
			t.biome = "ocean";
			t.moist = Math.max(t.moist, 62);
			t.suit = .5;
			const nb = neighborsOfIdx(g, i);
			if (nb.length > 0 && g.tiles[nb[0]].elev <= t.elev + 1) {
				g.tiles[nb[0]].biome = "ocean";
				g.tiles[nb[0]].moist = 55;
			}
			icePlaced++;
		}
	}
	let basins = 0;
	const basinOrder = [...Array(n).keys()].sort((a, b) => g.tiles[a].elev - g.tiles[b].elev || a - b);
	for (const i of basinOrder) {
		if (basins >= cfg.basinCount) break;
		const t = g.tiles[i];
		if (t.elev === 0 && i !== hub) {
			t.biome = "ocean";
			t.moist = 70;
			t.suit = .5;
			for (const nb of neighborsOfIdx(g, i).slice(0, 2)) if (g.tiles[nb].elev <= 1 && g.tiles[nb].biome === "barren") {
				g.tiles[nb].biome = "ocean";
				g.tiles[nb].moist = 58;
			}
			basins++;
		}
	}
	let nearestWater = Infinity;
	for (let i = 0; i < n; i++) if (g.tiles[i].biome === "ocean") nearestWater = Math.min(nearestWater, hexDistance(coords[i], coords[hub]));
	if (nearestWater > 4) {
		for (const i of withinRing(g, hub, 3)) if (g.tiles[i].elev <= 1) {
			g.tiles[i].biome = "ocean";
			g.tiles[i].moist = 60;
			break;
		}
	}
	let rich = 0;
	for (let i = 0; i < n; i++) if (g.tiles[i].dep >= 2) rich++;
	if (rich < 3) {
		for (const i of withinRing(g, hub, g.mapR)) if (g.tiles[i].dep < 2) {
			g.tiles[i].dep = 2;
			rich++;
			if (rich >= 4) break;
		}
	}
	for (const i of withinRing(g, hub, 2)) {
		const h = coords[i];
		if (hash2d(S + 13, h.q, h.r) > .62) g.tiles[i].dep = Math.max(g.tiles[i].dep, 2);
	}
	const hubT = g.tiles[hub];
	hubT.biome = "barren";
	hubT.elev = Math.max(2, hubT.elev);
	hubT.structure = "hub";
	hubT.fert = Math.max(hubT.fert, 20);
	hubT.moist = Math.max(hubT.moist, 18);
	g.hubIndex = hub;
	const oceanTiles = g.tiles.reduce((s2, t) => s2 + (t.biome === "ocean" ? 1 : 0), 0);
	g.planet.temp = cfg.tempStart;
	g.planet.water = Math.min(30, 6 + oceanTiles * .9);
	g.planet.oxygen = g.mode === "frozen" ? 3 : 5;
	g.planet.humidity = Math.max(2, 4 + oceanTiles * .6 + (g.mode === "frozen" ? -2 : 0));
	g.planet.pressure = g.mode === "frozen" ? 10 : 18;
	let [j1, rs1] = rngInt(rng, 9);
	let [j2, rs2] = rngInt(rs1, 11);
	let [, rs3] = rngInt(rs2, 7);
	const rm = cfg.resMult;
	g.res = {
		water: Math.round(16 * rm) + j1,
		minerals: Math.round(20 * rm) + j2,
		energy: Math.round(8 * rm) + rs3.a % 6,
		biomass: 0,
		research: Math.round(6 * rm)
	};
	setRng(g, {
		a: rs3.a,
		b: rs3.b,
		c: rs3.c,
		d: rs3.d
	});
	if (cfg.techStart && !g.techDone.includes(cfg.techStart)) g.techDone.push(cfg.techStart);
	g.planetName = planetNameFor(g.seed);
	computeTerritory(g, 2);
	const pickPool = [...OBJECTIVE_POOL];
	let cur2 = g.rng;
	const chosenIds = [];
	for (let k = 0; k < 3 && pickPool.length > 0; k++) {
		const [i, s] = rngInt(cur2, pickPool.length);
		cur2 = s;
		chosenIds.push(pickPool.splice(i, 1)[0].id);
	}
	setRng(g, cur2);
	g.objectives = [{
		id: "primary_self_sustaining",
		done: false
	}, ...chosenIds.map((id) => ({
		id,
		done: false
	}))];
	pushSnapshot(g, true);
}
//#endregion
//#region src/sim/adjacency.ts
/**
* Adjacency engine: per-tile yields with neighbor bonuses, combo detection,
* ecological network (corridor) scoring. The single source of truth used by
* economy, preview diffing and the renderer overlays.
*/
var LIVING_SET = new Set(LIVING_BIOMES);
var WATER_SET = new Set(WATER_BIOMES);
var devFactor = (dev) => .35 + .65 * (dev / 3);
function emptyYield() {
	return {
		wProd: 0,
		wUse: 0,
		mProd: 0,
		eProd: 0,
		eUse: 0,
		bio: 0,
		rp: 0,
		dT: 0,
		dO2: 0,
		dH: 0,
		dP: 0,
		dPoll: 0,
		moistAdd: 0,
		fertAdd: 0,
		bioPts: 0,
		combos: [],
		netMult: 1
	};
}
function addScaled(dst, y, s) {
	dst.wProd += (y.wProd ?? 0) * s;
	dst.wUse += (y.wUse ?? 0) * s;
	dst.mProd += (y.mProd ?? 0) * s;
	dst.eProd += (y.eProd ?? 0) * s;
	dst.eUse += (y.eUse ?? 0) * s;
	dst.bio += (y.bio ?? 0) * s;
	dst.rp += (y.rp ?? 0) * s;
	dst.dT += (y.dT ?? 0) * s;
	dst.dO2 += (y.dO2 ?? 0) * s;
	dst.dH += (y.dH ?? 0) * s;
	dst.dP += (y.dP ?? 0) * s;
	dst.dPoll += (y.dPoll ?? 0) * s;
	dst.moistAdd += (y.moistAdd ?? 0) * s;
	dst.fertAdd += (y.fertAdd ?? 0) * s;
}
function deriveAll(g, agg) {
	const n = g.tiles.length;
	const nei = neighborsIdx(g.mapR);
	const p = g.planet;
	const ty = new Array(n);
	const netSize = new Array(n).fill(0);
	{
		const seen = new Uint8Array(n);
		for (let i = 0; i < n; i++) {
			if (seen[i] || !LIVING_SET.has(g.tiles[i].biome) || g.tiles[i].dev <= 0) continue;
			const members = [];
			const stack = [i];
			seen[i] = 1;
			while (stack.length) {
				const c = stack.pop();
				members.push(c);
				for (const nb of nei[c]) if (!seen[nb] && LIVING_SET.has(g.tiles[nb].biome) && g.tiles[nb].dev > 0) {
					seen[nb] = 1;
					stack.push(nb);
				}
			}
			const size = members.length;
			for (const m of members) netSize[m] = size;
		}
	}
	const netBoost = agg.climate.netLinkBoost ?? 0;
	const combosFound = [];
	const usedByCombo = /* @__PURE__ */ new Map();
	const coords = mapIndex(g.mapR).coords;
	for (const cdef of COMBOS) usedByCombo.set(cdef.id, new Uint8Array(n));
	{
		const used = usedByCombo.get("grid");
		for (let i = 0; i < n; i++) {
			const t = g.tiles[i];
			if (t.structure !== GRID_COMBO_STRUCTS[0] && t.structure !== GRID_COMBO_STRUCTS[1]) continue;
			const partner = t.structure === GRID_COMBO_STRUCTS[0] ? GRID_COMBO_STRUCTS[1] : GRID_COMBO_STRUCTS[0];
			if (used[i]) continue;
			const nbWith = nei[i].filter((j) => g.tiles[j].structure === partner && !used[j]);
			if (nbWith.length === 0) continue;
			const group = [i, nbWith[0]];
			for (let k = 2; k < group.length + 8; k++) {
				const added = [];
				for (const gi of group) for (const j of nei[gi]) {
					const s = g.tiles[j].structure;
					if (!used[j] && !group.includes(j) && (s === "solar" || s === "battery")) added.push(j);
				}
				if (added.length === 0) break;
				group.push(added[0]);
			}
			for (const gi of group) used[gi] = 1;
			combosFound.push({
				id: "grid",
				tiles: group
			});
		}
	}
	for (const cdef of COMBOS) {
		if (cdef.id === "grid") continue;
		const used = usedByCombo.get(cdef.id);
		for (let i = 0; i < n; i++) {
			if (used[i]) continue;
			const have = /* @__PURE__ */ new Map();
			const anchor = g.tiles[i].biome;
			if (cdef.requires.includes(anchor)) have.set(anchor, i);
			for (const j of nei[i]) {
				const b = g.tiles[j].biome;
				if (cdef.requires.includes(b) && !have.has(b)) have.set(b, j);
			}
			if (have.size !== cdef.requires.length) continue;
			const group = [...have.values()];
			for (const gi of group) used[gi] = 1;
			combosFound.push({
				id: cdef.id,
				tiles: group
			});
		}
	}
	for (let i = 0; i < n; i++) {
		const t = g.tiles[i];
		const y = emptyYield();
		const bdef = BIOMES[t.biome];
		const s = devFactor(t.dev) * Math.max(.15, t.suit);
		if (t.dev > 0 || WATER_SET.has(t.biome)) addScaled(y, bdef.y, s);
		if (t.biome === "ocean") {
			const evap = Math.max(0, Math.min(1.4, (p.temp + 45) / 35));
			y.dH *= evap;
			y.moistAdd *= .4 + evap;
			y.wProd += .12 * evap * (t.moist / 100);
		}
		if (t.biome === "ocean" && p.temp < -8) y.wProd = 0;
		let nearWater = 0;
		let nearForest = 0;
		let nearLiving = 0;
		let distinct = 0;
		const kinds = /* @__PURE__ */ new Set();
		for (const j of nei[i]) {
			const o = g.tiles[j];
			if (WATER_SET.has(o.biome)) nearWater++;
			if (o.biome === "forest" || o.biome === "tropical") nearForest++;
			if (LIVING_SET.has(o.biome)) nearLiving++;
			if (o.biome !== "barren" && o.biome !== "rockwaste") kinds.add(o.biome);
		}
		distinct = kinds.size;
		switch (t.biome) {
			case "forest":
				y.bioPts += 3 * nearWater * devFactor(t.dev);
				y.bio += .15 * nearLiving;
				if (nearWater > 0) y.moistAdd += .5;
				break;
			case "wetland":
				y.bioPts += 4 * nearForest;
				y.dH += .1 * distinct;
				if (nearLiving > 2) y.bio += .3;
				break;
			case "grassland":
				y.bioPts += 2.5 * (nearWater + nearForest);
				if (nearForest > 0) y.fertAdd += 1.5;
				break;
			case "alpine": {
				const rain = (agg.climate.rainBoost ?? 0) * 5;
				y.moistAdd += nearWater * (1.5 + rain);
				y.bioPts += nearWater * 2;
				break;
			}
			case "river":
				y.bioPts += 3 * nearLiving;
				y.moistAdd += 1.2 * nei[i].filter((j) => !WATER_SET.has(g.tiles[j].biome)).length * .4;
				break;
			case "ecozone":
				y.bioPts += 6 * distinct;
				y.rp += .15 * distinct;
				break;
			case "tropical": y.bioPts += 4 * nearWater + 2 * distinct;
		}
		if (LIVING_SET.has(t.biome)) y.bioPts += (bdef.y.bioBase ?? 0) * devFactor(t.dev) * t.suit;
		if (t.structure) {
			const sdef = STRUCTURES[t.structure];
			addScaled(y, sdef.y, 1);
			y.dPoll += sdef.pollution * agg.pollutionMult;
			switch (t.structure) {
				case "solar": {
					const deserts = nei[i].filter((j) => g.tiles[j].biome === "desert").length;
					const clouds = Math.min(.5, p.humidity / 200 + p.temp / 400);
					y.eProd *= 1 + .5 * deserts - clouds + (t.elev >= 3 ? .15 : 0);
					const shade = nei[i].filter((j) => j !== i && (g.tiles[j].biome === "forest" || g.tiles[j].biome === "tropical")).length;
					y.eProd *= Math.max(.3, 1 - .18 * shade);
					break;
				}
				case "research": {
					let d2 = 0;
					const ks = /* @__PURE__ */ new Set();
					for (const j of withinDist(g.mapR, i, 2)) {
						const b = g.tiles[j].biome;
						if (b !== "barren" && b !== "rockwaste") ks.add(b);
					}
					d2 = Math.min(8, ks.size);
					y.rp *= 1 + .18 * d2;
					break;
				}
				case "extractor":
					if (nearWater > 0) y.wProd *= 1.4;
					if (p.temp < -20) y.wProd *= .5;
					break;
				case "mine": {
					const fragile = nei[i].filter((j) => LIVING_SET.has(g.tiles[j].biome)).length;
					y.dPoll += .12 * fragile * agg.pollutionMult;
					if (t.dep === 0) y.mProd = 0;
					else y.mProd *= .6 + .3 * t.dep;
					break;
				}
				case "geo":
					if (t.geo === 0) y.eProd = .2;
					break;
				case "habitat": {
					const healthy = nei[i].filter((j) => {
						const o = g.tiles[j];
						return LIVING_SET.has(o.biome) && o.dev >= 1 && o.suit > .5;
					}).length;
					y.rp += .15 * healthy;
					y.bioPts += 4 * healthy;
					y.dPoll += .08 * (6 - healthy) * agg.pollutionMult;
					break;
				}
				case "battery": {
					const solarNb = nei[i].filter((j) => g.tiles[j].structure === "solar").length;
					y.eProd += .25 * solarNb;
					break;
				}
				case "biodivlab":
					y.bioPts += 3;
					break;
				case "weather": y.dH += .25;
			}
		}
		const size = netSize[i];
		let nm = 1;
		if (size >= 3) nm = Math.min(1.75, .9 + size * .055 + netBoost);
		else if (size > 0) nm = .75;
		y.netMult = nm;
		y.bioPts *= nm;
		y.bio *= nm;
		ty[i] = y;
	}
	for (const cf of combosFound) {
		const cdef = COMBOS.find((c) => c.id === cf.id);
		for (const j of cf.tiles) {
			const y = ty[j];
			y.rp += cdef.bonus.rp ?? 0;
			y.bio += cdef.bonus.bio ?? 0;
			y.eProd += cdef.bonus.eProd ?? 0;
			y.wProd += cdef.bonus.wProd ?? 0;
			y.dH += cdef.bonus.dH ?? 0;
			y.dO2 += cdef.bonus.dO2 ?? 0;
			y.bioPts += 4;
			y.combos.push(cdef.id);
		}
	}
	for (let i = 0; i < n; i++) {
		if (g.tiles[i].structure !== "weather") continue;
		for (const j of withinDist(g.mapR, i, 2)) {
			const h = hexDistance(coords[i], coords[j]);
			ty[j].moistAdd += h <= 1 ? 2.2 : 1.1;
		}
	}
	for (let i = 0; i < n; i++) if (g.tiles[i].structure === "biodivlab") for (const j of nei[i]) {
		const o = g.tiles[j];
		if (LIVING_SET.has(o.biome)) ty[j].bioPts += 3 * devFactor(o.dev) * o.suit;
	}
	const totals = {
		prod: {
			water: .6,
			minerals: .8,
			energy: .6,
			biomass: 0,
			research: .7
		},
		use: {
			water: 0,
			minerals: 0,
			energy: 0,
			biomass: 0,
			research: 0
		},
		dTemp: 0,
		dOxy: 0,
		dHum: 0,
		dPressure: 0,
		dBio: 0,
		dFert: 0,
		dPoll: 0,
		dWaterStock: 0
	};
	const allKinds = /* @__PURE__ */ new Set();
	let livingTiles = 0;
	let waterTiles = 0;
	let forestTiles = 0;
	const structCount = {};
	let powerDeficit = false;
	for (let i = 0; i < n; i++) {
		const t = g.tiles[i];
		const y = ty[i];
		totals.prod.water += y.wProd;
		totals.use.water += y.wUse;
		totals.prod.minerals += y.mProd;
		totals.prod.energy += y.eProd;
		totals.use.energy += y.eUse;
		totals.prod.biomass += y.bio;
		totals.prod.research += y.rp;
		totals.dTemp += y.dT;
		totals.dOxy += y.dO2;
		totals.dHum += y.dH;
		totals.dPressure += y.dP;
		totals.dPoll += y.dPoll * agg.pollutionMult;
		if (t.biome !== "barren") allKinds.add(t.biome);
		if (LIVING_SET.has(t.biome) && t.dev > 0) livingTiles++;
		if (WATER_SET.has(t.biome)) waterTiles++;
		if (t.biome === "forest" || t.biome === "tropical") forestTiles++;
		if (t.structure) structCount[t.structure] = (structCount[t.structure] ?? 0) + 1;
	}
	for (const k of Object.keys(totals.prod)) totals.prod[k] *= agg.prodMult[k] ?? 1;
	totals.dPressure += livingTiles * .004 + waterTiles * .002;
	totals.prod.research *= 1 + Math.min(.5, allKinds.size * .04);
	powerDeficit = totals.use.energy > totals.prod.energy;
	if (powerDeficit) {
		const f = Math.max(.5, totals.prod.energy / Math.max(.01, totals.use.energy));
		totals.prod.minerals *= f;
		totals.prod.research *= f;
		totals.prod.biomass *= f;
	}
	return {
		ty,
		totals,
		combosFound,
		netSize,
		distinctBiomes: allKinds.size,
		livingTiles,
		waterTiles,
		forestTiles,
		structCount,
		powerDeficit
	};
}
//#endregion
//#region src/sim/climate.ts
/**
* Climate & ecology simulation. Everything is interconnected:
*   forest → oxygen → humidity → rainfall → vegetation → biodiversity
*   industry → heat + pollution → drying → desertification → forest dieback
*/
var clamp$1 = (x, a, b) => Math.max(a, Math.min(b, x));
var LIVING = new Set(LIVING_BIOMES);
/** planet-level step: one climate cycle */
function stepPlanet(g, agg, d, fx) {
	const p = g.planet;
	const m = g.modifiers;
	const mod = (id) => m.find((x) => x.id === id);
	const t = p.temp;
	const cool = -(t + 110) * .0015;
	const greenhouse = (p.oxygen * .004 + p.pressure * .004 + p.pollution * .006) * (1 + (agg.climate.greenhouse ?? 0)) + (agg.climate.greenhouseBase ?? 0);
	const humidityWarm = p.humidity * .0045;
	const cloudCool = -Math.max(0, p.humidity - 45) * .005;
	const hotCool = -Math.max(0, t - 28) * .012;
	const iceAlbedo = -Math.max(0, -t - 25) * .0025;
	let dT = cool + greenhouse + humidityWarm + cloudCool + hotCool + iceAlbedo + d.totals.dTemp + (agg.climate.tempDrift ?? 0);
	if (mod("solarFlare")) dT -= .3;
	if (mod("icestorm")) dT -= .5;
	if (mod("superstorm")) dT -= .2;
	if (mod("eruption")) dT += .6;
	if (mod("dustveil")) dT -= .6;
	p.temp = clamp$1(t + dT, -80, 60);
	const evap = d.totals.dHum * .5 + d.waterTiles * .02 * clamp$1((p.temp + 30) / 45, 0, 1.4) + p.water * .003;
	let rainUse = clamp$1(p.humidity / 100, 0, 1) * (.55 + (agg.climate.rainBoost ?? 0)) * (1 + countAlpineNearWater(g) * .02) * (mod("drought") ? .4 : 1);
	p.humidity = clamp$1(p.humidity + evap - rainUse * .8 - Math.max(0, p.humidity - 85) * .02, 0, 100);
	const photo = d.totals.dOxy * .4 * (1 - p.pollution / 160) * (.6 + p.humidity / 180);
	const oxyLoss = .02 + p.pollution * .004;
	p.oxygen = clamp$1(p.oxygen + photo - oxyLoss + (agg.climate.o2Boost ?? 0) * Math.max(0, photo) * .4, 0, 100);
	p.pressure = clamp$1(p.pressure + d.totals.dPressure + (agg.climate.pressureGain ?? 0) * .05 + p.oxygen * .002 - .012, 0, 100);
	p.pollution = clamp$1(p.pollution + d.totals.dPoll - (.25 + d.waterTiles * .004 + countBiome(g, "ecozone") * .05 + countBiome(g, "wetland") * .02) * (mod("ecoBoom") ? 1.5 : 1), 0, 100);
	const avgMoist = g.tiles.reduce((s, x) => s + x.moist, 0) / g.tiles.length;
	const moistTarget = clamp$1(d.waterTiles * 1.6 + avgMoist * .55 + g.res.water * .08 + (p.temp > -5 ? 8 : 0), 0, 100);
	p.water = p.water + (moistTarget - p.water) * .15;
	const fertTarget = clamp$1(g.tiles.reduce((s, x) => s + x.fert, 0) / g.tiles.length, 0, 100);
	p.fert = p.fert + (fertTarget - p.fert) * .2;
	const bioTarget = clamp$1(Math.sqrt(bioPoints(g, d)) * 5.4 - p.pollution * .55 - (mod("pest") ? 8 : 0) + (mod("ecoBoom") ? 6 : 0), 0, 100);
	p.bio = clamp$1(p.bio + (bioTarget - p.bio) * .18, 0, 100);
	const tempOK = 1 - clamp$1(Math.abs(p.temp - 8) / 45, 0, 1);
	const pollOK = 1 - clamp$1(p.pollution / 60, 0, 1);
	const humOK = 1 - clamp$1(Math.abs(p.humidity - 48) / 60, 0, 1);
	const oxyOK = clamp$1(p.oxygen / 22, 0, 1);
	const bioOK = clamp$1(p.bio / 70, 0, 1);
	const stabTarget = clamp$1((tempOK * .26 + pollOK * .2 + humOK * .14 + oxyOK * .2 + bioOK * .2) * 100, 0, 100);
	p.stability = clamp$1(p.stability + (stabTarget - p.stability) * .22, 0, 100);
}
function countBiome(g, b) {
	let c = 0;
	for (const t of g.tiles) if (t.biome === b) c++;
	return c;
}
function countAlpineNearWater(g) {
	const nei = neighborsIdx(g.mapR);
	let c = 0;
	for (let i = 0; i < g.tiles.length; i++) {
		if (g.tiles[i].biome !== "alpine") continue;
		if (nei[i].some((j) => g.tiles[j].biome === "ocean" || g.tiles[j].biome === "river" || g.tiles[j].moist > 55)) c++;
	}
	return c;
}
function bioPoints(g, d) {
	let pts = 0;
	for (let i = 0; i < g.tiles.length; i++) pts += d.ty[i].bioPts;
	return Math.max(0, pts);
}
/** per-tile weathering / moisture / growth / succession / dieback */
function stepTiles(g, agg, d, fx) {
	const p = g.planet;
	const nei = neighborsIdx(g.mapR);
	const n = g.tiles.length;
	let rng = g.rng;
	const mod = (id) => g.modifiers.find((x) => x.id === id);
	const drought = !!mod("drought");
	const ecoBoom = !!mod("ecoBoom");
	const pest = !!mod("pest");
	const rainGlobal = clamp$1(p.humidity / 100, 0, 1) * (drought ? .4 : 1) * (1 + (agg.climate.rainBoost ?? 0));
	const newMoist = new Array(n);
	const newFert = new Array(n);
	const newPoll = new Array(n);
	for (let i = 0; i < n; i++) {
		const t = g.tiles[i];
		const y = d.ty[i];
		let moist = t.moist + y.moistAdd;
		moist += rainGlobal * (2.2 + (t.elev <= 1 ? 1 : 0)) * .5;
		const evap = clamp$1((p.temp + 5) / 45, 0, 1) * (t.biome === "ocean" ? .6 : 1.6);
		moist -= evap * (t.moist > 30 ? 1 : .4);
		if (LIVING.has(t.biome)) moist -= t.dev * .35;
		if (p.temp < -18) moist *= .995;
		newMoist[i] = clamp$1(moist, 0, 100);
		let fert = t.fert + y.fertAdd * .3;
		if (LIVING.has(t.biome) && t.dev > .5) fert += .5 * t.dev * rainGlobal;
		fert -= t.poll * .02 + Math.max(0, p.temp - 30) * .02;
		fert += .02;
		newFert[i] = clamp$1(fert, 0, 100);
		let poll = t.poll;
		for (const j of nei[i]) {
			const o = g.tiles[j];
			if (o.structure === "mine" || o.structure === "geo" || o.structure === "hub") poll += .12 * agg.pollutionMult;
		}
		if (t.structure === "mine" || t.structure === "geo") poll += .25 * agg.pollutionMult;
		poll -= .1 + (t.biome === "wetland" ? .25 : 0) + (t.biome === "ecozone" ? .4 : 0);
		newPoll[i] = clamp$1(poll + Math.max(0, p.pollution - 40) * .004, 0, 100);
	}
	for (let i = 0; i < n; i++) {
		g.tiles[i].moist = newMoist[i];
		g.tiles[i].fert = newFert[i];
		g.tiles[i].poll = newPoll[i];
	}
	for (let i = 0; i < n; i++) {
		const t = g.tiles[i];
		const def = BIOMES[t.biome];
		const target = def.suit(t, p);
		t.suit = t.suit + (target - t.suit) * .25;
		if (t.structure === "hub") continue;
		if (LIVING.has(t.biome) || t.biome === "mineralfield" || t.biome === "desert") {
			const support = Math.min(1, t.suit + (t.dev >= 1.5 ? .18 : 0));
			if (support > .38) {
				const prevDev = t.dev;
				t.dev = Math.min(3, t.dev + def.grow * (support - .22) * (ecoBoom ? 1.8 : 1));
				if (prevDev < 1.5 && t.dev >= 1.5) fx.push({
					kind: "float",
					tile: i,
					text: `${def.icon}✓`,
					tone: "good"
				});
				else if (prevDev < 3 && t.dev >= 3) fx.push({
					kind: "float",
					tile: i,
					text: `${def.icon}✸`,
					tone: "good"
				});
			} else if (t.suit < .16) {
				t.dev = Math.max(0, t.dev - .1);
				if (t.dev <= .02 && t.biome !== "barren" && t.biome !== "rockwaste" && !t.structure) {
					const from = t.biome;
					t.biome = "rockwaste";
					t.dev = 0;
					t.tTf = g.cycle;
					g.stats.tilesLost++;
					fx.push({
						kind: "transform",
						tile: i,
						from,
						to: "rockwaste"
					});
				}
			}
			if (pest && (t.biome === "forest" || t.biome === "tropical")) t.dev = Math.max(0, t.dev - .12);
		}
	}
	const spreadProb = (ecoBoom ? 2 : 1) * (.012 + p.stability * 2e-4);
	for (let i = 0; i < n; i++) {
		const t = g.tiles[i];
		if (t.biome !== "barren" && t.biome !== "rockwaste") continue;
		for (const j of nei[i]) {
			const src = g.tiles[j];
			if (!LIVING.has(src.biome) || src.dev < 2) continue;
			const s2 = BIOMES[src.biome].suit(t, p);
			if (s2 < .68) continue;
			let [r1, s] = rngFloat(rng);
			rng = s;
			if (r1 < spreadProb * s2) {
				t.biome = src.biome;
				t.dev = .25;
				t.tTf = g.cycle;
				fx.push({
					kind: "transform",
					tile: i,
					from: "barren",
					to: t.biome
				});
				break;
			}
		}
		if (t.biome !== "barren" && t.biome !== "rockwaste") continue;
		if (t.elev <= 2 && t.moist > 62 && t.fert > 35) {
			if (nei[i].some((j) => g.tiles[j].biome === "river" || g.tiles[j].biome === "wetland" || g.tiles[j].biome === "ocean" && t.moist > 70)) {
				let [r2, s] = rngFloat(rng);
				rng = s;
				if (r2 < .02) {
					t.biome = "wetland";
					t.dev = .2;
					t.tTf = g.cycle;
					fx.push({
						kind: "transform",
						tile: i,
						from: "barren",
						to: "wetland"
					});
				}
			}
		}
	}
	setRng(g, rng);
}
/** dev as integer stage for renderers/snapshots */
var devStage = (dev) => Math.floor(clamp$1(dev, 0, 2.999));
//#endregion
//#region src/sim/actions.ts
/**
* Player actions: placement rules, costs, chain reactions and what-if preview.
* Preview clones only the touched tiles and re-runs the adjacency engine, so
* the numbers shown before committing are exactly what will happen.
*/
function isBiomeUnlocked(g, agg, b) {
	const def = BIOMES[b];
	if (!def.placeable) return false;
	return def.unlock === null || g.techDone.includes(def.unlock);
}
function isStructureUnlocked(g, agg, s) {
	const def = STRUCTURES[s];
	if (def.unlock === null || FREE_STRUCTURES.includes(s)) return true;
	return agg.unlockedStructures.has(s) || g.techDone.includes(def.unlock);
}
function buildCtx(g, i) {
	const nei = neighborsIdx(g.mapR);
	const nearBiomes = /* @__PURE__ */ new Set();
	const near2Biomes = /* @__PURE__ */ new Set();
	for (const j of nei[i]) nearBiomes.add(g.tiles[j].biome);
	for (const j of withinDist(g.mapR, i, 2)) near2Biomes.add(g.tiles[j].biome);
	const distinctNearBiomes = [...nearBiomes].filter((b) => b !== "barren" && b !== "rockwaste").length;
	return {
		neighbors: nei[i].map((j) => g.tiles[j]),
		nearBiomes,
		near2Biomes,
		distinctNearBiomes
	};
}
function biomeCost(g, agg, b) {
	const base = BIOMES[b].cost;
	const m = agg.biomeCostMult[b] ?? 1;
	const out = {};
	Object.keys(base).forEach((k) => {
		out[k] = Math.max(1, Math.round((base[k] ?? 0) * m));
	});
	return out;
}
function structureCost(g, agg, s) {
	const base = STRUCTURES[s].cost;
	const out = {};
	Object.keys(base).forEach((k) => {
		out[k] = Math.max(1, Math.round((base[k] ?? 0) * agg.structCostMult));
	});
	return out;
}
function canAfford(res, cost) {
	return Object.keys(cost).every((k) => res[k] >= (cost[k] ?? 0));
}
function payCost(res, cost) {
	Object.keys(cost).forEach((k) => {
		res[k] -= cost[k] ?? 0;
	});
}
/** Full validity check for placing biome or structure on a tile. */
function checkPlacement(g, agg, i, biome, structure) {
	if (i < 0 || i >= g.tiles.length) return {
		ok: false,
		reason: "err.noTile"
	};
	if (g.end) return {
		ok: false,
		reason: "err.gameOver"
	};
	if (!g.inTerritory[i]) return {
		ok: false,
		reason: "err.notInTerritory"
	};
	const t = g.tiles[i];
	if (biome) {
		const def = BIOMES[biome];
		if (!isBiomeUnlocked(g, agg, biome)) return {
			ok: false,
			reason: "err.locked"
		};
		if (t.biome === biome) return {
			ok: false,
			reason: "err.sameBiome"
		};
		if (t.structure) return {
			ok: false,
			reason: "err.occupied"
		};
		if (def.req && !def.req(t, g, i, buildCtx(g, i))) return {
			ok: false,
			reason: def.reqKey
		};
		const cost = biomeCost(g, agg, biome);
		if (!canAfford(g.res, cost)) return {
			ok: false,
			reason: "err.cost"
		};
		return { ok: true };
	}
	if (structure) {
		const def = STRUCTURES[structure];
		if (structure === "hub") return {
			ok: false,
			reason: "err.noBuildHub"
		};
		if (!isStructureUnlocked(g, agg, structure)) return {
			ok: false,
			reason: "err.locked"
		};
		if (t.structure) return {
			ok: false,
			reason: "err.occupied"
		};
		if (def.forbidBiome?.includes(t.biome)) return {
			ok: false,
			reason: "err.badTerrain"
		};
		if (def.req && !def.req(t, g, i, buildCtx(g, i))) return {
			ok: false,
			reason: def.reqKey
		};
		const cost = structureCost(g, agg, structure);
		if (!canAfford(g.res, cost)) return {
			ok: false,
			reason: "err.cost"
		};
		return { ok: true };
	}
	return {
		ok: false,
		reason: "err.nothingSelected"
	};
}
/** After the raw placement, possible cascades. Returns transform FX. */
function chainReactions(g, i, fx) {
	const t = g.tiles[i];
	const p = g.planet;
	let rng = g.rng;
	const nei = neighborsOfIdx(g, i);
	const roll = (prob) => {
		const [r, s] = rngFloat(rng);
		rng = s;
		return r < prob;
	};
	if (t.biome === "alpine") {
		const low = nei.filter((j) => g.tiles[j].elev <= 2 && (g.tiles[j].biome === "barren" || g.tiles[j].biome === "rockwaste"));
		for (const j of low) {
			const w = g.tiles[j];
			if (w.moist > 45 && roll(.22)) {
				const from = w.biome;
				w.biome = BIOMES.river.unlock === null || g.techDone.includes("hyd_rivers") ? "river" : "wetland";
				w.moist = Math.max(w.moist, 55);
				w.tTf = g.cycle;
				fx.push({
					kind: "transform",
					tile: j,
					from,
					to: w.biome
				});
				break;
			} else if (w.moist > 30 && roll(.1)) {
				w.moist = Math.min(100, w.moist + 18);
				break;
			}
		}
	}
	if (t.biome === "forest" || t.biome === "tropical") for (const j of nei) {
		const w = g.tiles[j];
		if ((w.biome === "barren" || w.biome === "rockwaste") && w.fert > 25 && w.moist > 25 && roll(.12)) {
			const from = w.biome;
			w.biome = "grassland";
			w.dev = .3;
			w.tTf = g.cycle;
			fx.push({
				kind: "transform",
				tile: j,
				from,
				to: "grassland"
			});
		}
	}
	if (t.biome === "ocean") {
		for (const j of nei) g.tiles[j].moist = Math.min(100, g.tiles[j].moist + 14);
		if (p.temp > -4 && t.elev === 0) {
			const low = nei.filter((j) => g.tiles[j].elev === 0 && g.tiles[j].biome === "barren");
			if (low.length && roll(.18)) {
				const j = low[0];
				const from = g.tiles[j].biome;
				g.tiles[j].biome = "ocean";
				g.tiles[j].moist = 70;
				g.tiles[j].tTf = g.cycle;
				fx.push({
					kind: "transform",
					tile: j,
					from,
					to: "ocean"
				});
			}
		}
	}
	if (t.biome === "river") {
		const down = nei.filter((j) => g.tiles[j].elev < t.elev + .001 && (g.tiles[j].biome === "barren" || g.tiles[j].biome === "rockwaste"));
		if (down.length && roll(.16)) {
			down.sort((a, b) => g.tiles[a].elev - g.tiles[b].elev);
			const j = down[0];
			const from = g.tiles[j].biome;
			g.tiles[j].biome = "river";
			g.tiles[j].moist = Math.max(g.tiles[j].moist, 55);
			g.tiles[j].tTf = g.cycle;
			fx.push({
				kind: "transform",
				tile: j,
				from,
				to: "river"
			});
		}
		for (const j of nei) g.tiles[j].moist = Math.min(100, g.tiles[j].moist + 8);
	}
	if (t.biome === "ecozone") for (const j of nei) {
		const w = g.tiles[j];
		if ([
			"grassland",
			"forest",
			"wetland",
			"tropical",
			"tundra"
		].includes(w.biome)) {
			w.dev = Math.min(3, w.dev + .35);
			w.fert = Math.min(100, w.fert + 6);
		}
	}
	g.rng = rng;
}
/** Apply the (already checked) placement immediately. */
function applyPlacement(g, agg, i, fx, biome, structure) {
	if (!checkPlacement(g, agg, i, biome, structure).ok) return false;
	const t = g.tiles[i];
	if (biome) {
		const cost = biomeCost(g, agg, biome);
		payCost(g.res, cost);
		const from = t.biome;
		t.biome = biome;
		if (biome === "rockwaste") t.dev = 1;
		else if (biome === "ocean" || biome === "river") t.dev = 3;
		else {
			t.dev = Math.max(.6, t.dev);
			t.suit = Math.max(t.suit, .5);
			t.fert = Math.max(t.fert, 24);
			t.moist = Math.max(t.moist, 14);
		}
		t.tTf = g.cycle;
		g.stats.placed++;
		fx.push({
			kind: "place",
			tile: i,
			biome,
			structure: null
		});
		if (from !== biome) fx.push({
			kind: "transform",
			tile: i,
			from,
			to: biome
		});
		chainReactions(g, i, fx);
		return true;
	}
	if (structure) {
		const cost = structureCost(g, agg, structure);
		payCost(g.res, cost);
		t.structure = structure;
		if (t.dev < 1 && t.biome === "barren") t.biome = "rockwaste";
		t.tTf = g.cycle;
		g.stats.placed++;
		g.stats.structures++;
		fx.push({
			kind: "place",
			tile: i,
			biome: t.biome,
			structure
		});
		if (structure === "habitat") computeTerritory(g, 2 + agg.rangeAdd);
		return true;
	}
	return false;
}
/**
* What-if preview: clone touched tile state, rerun derivation, diff.
* Used by the hover panel (§27) and by the placement confirmation.
*/
function previewPlacement(g, i, biome, structure) {
	const agg = aggregateTechs(g);
	const before = deriveAll(g, agg);
	const t = g.tiles[i];
	const saved = { ...t };
	const ok = checkPlacement(g, agg, i, biome, structure).ok;
	const cost = biome ? biomeCost(g, agg, biome) : structure ? structureCost(g, agg, structure) : {};
	if (!ok) return {
		ok: false,
		reason: checkPlacement(g, agg, i, biome, structure).reason,
		cost,
		deltas: {
			res: {},
			planet: {}
		},
		comboIds: [],
		affected: []
	};
	try {
		if (biome) {
			t.biome = biome;
			t.dev = ["ocean", "river"].includes(biome) ? 3 : Math.max(t.dev, biome === "rockwaste" ? 1 : .6);
			if (LIVING_BIOMES.includes(biome)) {
				t.suit = Math.max(t.suit, .5);
				t.fert = Math.max(t.fert, 24);
				t.moist = Math.max(t.moist, 14);
			}
			t.suit = Math.max(t.suit, BIOMES[biome].suit({ ...t }, g.planet));
		}
		if (structure) t.structure = structure;
		const after = deriveAll(g, agg);
		const res = {};
		[
			"water",
			"minerals",
			"energy",
			"biomass",
			"research"
		].forEach((k) => {
			const v = after.totals.prod[k] - after.totals.use[k] - (before.totals.prod[k] - before.totals.use[k]);
			if (Math.abs(v) >= .05) res[k] = Math.round(v * 10) / 10;
		});
		const planet = {};
		const pairs = [
			["temp", after.totals.dTemp - before.totals.dTemp],
			["oxygen", after.totals.dOxy - before.totals.dOxy],
			["humidity", after.totals.dHum - before.totals.dHum],
			["bio", after.totals.dBio - before.totals.dBio],
			["pollution", after.totals.dPoll - before.totals.dPoll],
			["pressure", after.totals.dPressure - before.totals.dPressure]
		];
		for (const [k, v] of pairs) if (Math.abs(v) >= .01) planet[k] = Math.round(v * 100) / 100;
		const affected = [];
		for (let j = 0; j < g.tiles.length; j++) {
			const a = before.ty[j];
			const b2 = after.ty[j];
			if (Math.abs(a.bioPts - b2.bioPts) + Math.abs(a.wProd - b2.wProd) + Math.abs(a.eProd - b2.eProd) + Math.abs(a.mProd - b2.mProd) + Math.abs(a.rp - b2.rp) + Math.abs(a.moistAdd - b2.moistAdd) > .05) affected.push(j);
		}
		const newCombos = after.combosFound.filter((c) => c.tiles.includes(i) || !before.combosFound.some((bc) => bc.id === c.id && bc.tiles.length === c.tiles.length));
		return {
			ok: true,
			cost,
			deltas: {
				res,
				planet
			},
			comboIds: newCombos.map((c) => c.id),
			affected
		};
	} finally {
		Object.assign(t, saved);
	}
}
function findHubIndex(g) {
	for (let i = 0; i < g.tiles.length; i++) if (g.tiles[i].structure === "hub") return i;
	return 0;
}
//#endregion
//#region src/sim/events.ts
/**
* Environmental events. They must create decisions, not just punishment:
* every event changes the planet through the player's own choice.
*/
var clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function addMod(g, id, cycles, data = []) {
	const ex = g.modifiers.find((m) => m.id === id);
	if (ex) {
		ex.cycles = Math.max(ex.cycles, cycles);
		return;
	}
	g.modifiers.push({
		id,
		cycles,
		data
	});
}
function floatPlanet(g, k, v) {
	const p = g.planet;
	p[k] = clamp(p[k] + v, k === "temp" ? -80 : 0, k === "temp" ? 60 : 100);
}
function pickTiles(g, count, pred, rng) {
	const pool = [];
	for (let i = 0; i < g.tiles.length; i++) if (pred(i)) pool.push(i);
	const out = [];
	let r = rng;
	for (let k = 0; k < count && pool.length > 0; k++) {
		const [i, s] = rngInt(r, pool.length);
		r = s;
		out.push(pool.splice(i, 1)[0]);
	}
	return [out, r];
}
var EVENTS = [
	{
		id: "solarflare",
		kind: "instant",
		good: false,
		cond: () => true,
		weight: (g) => 4 + g.techDone.filter((t) => t.startsWith("nrg")).length * 2,
		apply: (g, fx) => {
			addMod(g, "solarFlare", 3);
			fx.push({
				kind: "milestone",
				key: "ev.solarflare.applied",
				tone: "bad"
			});
		}
	},
	{
		id: "icestorm",
		kind: "instant",
		good: false,
		cond: (g) => g.planet.temp < 2,
		weight: (g) => clamp(10 - g.planet.temp, 2, 14),
		apply: (g, fx) => {
			floatPlanet(g, "temp", -2.5);
			addMod(g, "icestorm", 2);
			fx.push({
				kind: "milestone",
				key: "ev.icestorm.applied",
				tone: "bad"
			});
		}
	},
	{
		id: "drought",
		kind: "instant",
		good: false,
		cond: (g) => g.planet.temp > 8 && g.planet.humidity > 25,
		weight: (g) => clamp((g.planet.temp - 5) / 3, 1, 10),
		apply: (g, fx) => {
			addMod(g, "drought", 4);
			floatPlanet(g, "humidity", -8);
			for (const t of g.tiles) if (t.biome === "grassland" && t.moist < 30) t.moist -= 6;
			fx.push({
				kind: "milestone",
				key: "ev.drought.applied",
				tone: "bad"
			});
		}
	},
	{
		id: "superstorm",
		kind: "instant",
		good: false,
		cond: (g) => g.planet.humidity > 45 && g.planet.water > 25,
		weight: (g) => g.planet.humidity / 12,
		apply: (g, fx) => {
			let rng = g.rng;
			floatPlanet(g, "humidity", -12);
			floatPlanet(g, "temp", -1.5);
			const [low, r2] = pickTiles(g, 2, (i) => g.tiles[i].elev <= 2 && (g.tiles[i].biome === "barren" || g.tiles[i].biome === "rockwaste"), rng);
			rng = r2;
			for (const i of low) {
				const t = g.tiles[i];
				if (t.moist > 30) {
					const from = t.biome;
					t.biome = "river";
					t.dev = 3;
					t.moist = 75;
					t.tTf = g.cycle;
					fx.push({
						kind: "transform",
						tile: i,
						from,
						to: "river"
					});
				}
			}
			for (const t of g.tiles) if ((t.biome === "forest" || t.biome === "tropical") && t.dev > 1) t.dev -= .4;
			g.rng = rng;
			fx.push({
				kind: "milestone",
				key: "ev.superstorm.applied",
				tone: "bad"
			});
		}
	},
	{
		id: "meteor",
		kind: "choice",
		good: false,
		cond: () => true,
		weight: () => 3.5,
		options: [
			{
				key: "ev.meteor.a",
				apply: (g, fx) => {
					g.res.minerals += 55;
					g.res.research += 8;
					addMod(g, "dustveil", 2);
					fx.push({
						kind: "float",
						tile: g.hubIndex,
						text: "+55⛁",
						tone: "good"
					});
				}
			},
			{
				key: "ev.meteor.b",
				apply: (g, fx) => {
					const cand = [...g.tiles.keys()].filter((i) => g.tiles[i].elev <= 1 && g.tiles[i].biome !== "ocean");
					if (cand.length) {
						const i = cand[g.cycle % cand.length];
						const t = g.tiles[i];
						const from = t.biome;
						t.biome = "ocean";
						t.moist = 80;
						t.dev = 3;
						t.tTf = g.cycle;
						g.res.water += 25;
						fx.push({
							kind: "transform",
							tile: i,
							from,
							to: "ocean"
						});
					} else g.res.water += 35;
					floatPlanet(g, "temp", 1.5);
				}
			},
			{
				key: "ev.meteor.c",
				apply: (g, fx) => {
					floatPlanet(g, "bio", -6);
					const nei = neighborsIdx(g.mapR);
					const dmg = /* @__PURE__ */ new Set();
					for (let i = 0; i < g.tiles.length; i++) if (g.tiles[i].poll > 0) for (const j of nei[i]) dmg.add(j);
					const hit = [...dmg].filter((i) => BIOMES[g.tiles[i].biome].placeable && g.tiles[i].dev > 0);
					for (const i of hit.slice(0, 6)) {
						const t = g.tiles[i];
						t.dev = 0;
						t.poll = Math.min(100, t.poll + 30);
						fx.push({
							kind: "float",
							tile: i,
							text: "✖",
							tone: "bad"
						});
					}
					g.stats.tilesLost += Math.min(6, hit.length);
				}
			}
		]
	},
	{
		id: "aquifer",
		kind: "choice",
		good: true,
		cond: (g) => g.cycle > 6,
		weight: () => 4,
		options: [
			{
				key: "ev.aquifer.a",
				apply: (g, fx) => {
					g.res.water += 80;
					floatPlanet(g, "bio", -4);
					floatPlanet(g, "fert", -3);
					fx.push({
						kind: "float",
						tile: g.hubIndex,
						text: "+80💧",
						tone: "good"
					});
				}
			},
			{
				key: "ev.aquifer.b",
				apply: (g, fx) => {
					addMod(g, "aquiferGuard", 14);
					for (const t of g.tiles) t.moist = clamp(t.moist + 8, 0, 100);
					fx.push({
						kind: "milestone",
						key: "ev.aquifer.preserved",
						tone: "good"
					});
				}
			},
			{
				key: "ev.aquifer.c",
				apply: (g, fx) => {
					const { keyToIdx } = mapIndex(g.mapR);
					const { coords } = mapIndex(g.mapR);
					let made = 0;
					for (let i = 0; i < coords.length && made < 3; i++) {
						const t = g.tiles[i];
						if (t.elev <= 2 && (t.biome === "barren" || t.biome === "rockwaste") && made < 3 && i % 7 === g.cycle % 7) {
							const from = t.biome;
							t.biome = "river";
							t.dev = 3;
							t.moist = 70;
							t.tTf = g.cycle;
							fx.push({
								kind: "transform",
								tile: i,
								from,
								to: "river"
							});
							made++;
						}
					}
					g.res.water += 20;
				}
			}
		]
	},
	{
		id: "eruption",
		kind: "instant",
		good: false,
		cond: (g) => g.tiles.some((t) => t.geo === 1),
		weight: (g) => (g.mode === "volcanic" ? 9 : 3.5) - g.planet.stability / 25,
		apply: (g, fx) => {
			let rng = g.rng;
			const [hot, r2] = pickTiles(g, 3, (i) => g.tiles[i].elev >= 3, rng);
			rng = r2;
			for (const i of hot) {
				const t = g.tiles[i];
				for (const nb of neighborsIdx(g.mapR)[i]) {
					const o = g.tiles[nb];
					if (o.dev > .4 && rng) {
						const [r, s] = rngFloat(rng);
						rng = s;
						if (r < .5) {
							const from = o.biome;
							o.dev = 0;
							o.poll = clamp(o.poll + 22, 0, 100);
							if (from === "barren" || from === "rockwaste") o.fert = clamp(o.fert + 12, 0, 100);
							if (o.biome === "forest" && r < .25) {
								o.biome = "rockwaste";
								o.tTf = g.cycle;
								fx.push({
									kind: "transform",
									tile: nb,
									from,
									to: "rockwaste"
								});
							}
						} else o.fert = clamp(o.fert + 14, 0, 100);
					}
				}
				t.dep = Math.min(3, t.dep + 1);
			}
			floatPlanet(g, "temp", 3);
			floatPlanet(g, "pollution", 7);
			g.rng = rng;
			fx.push({
				kind: "milestone",
				key: "ev.eruption.applied",
				tone: "bad"
			});
		}
	},
	{
		id: "pestbloom",
		kind: "instant",
		good: false,
		cond: (g) => g.tiles.filter((t) => t.biome === "forest" || t.biome === "tropical").length > 10,
		weight: (g) => g.tiles.filter((t) => t.biome === "forest").length / 8,
		apply: (g, fx) => {
			addMod(g, "pest", 3);
			fx.push({
				kind: "milestone",
				key: "ev.pest.applied",
				tone: "bad"
			});
		}
	},
	{
		id: "ecoboom",
		kind: "instant",
		good: true,
		cond: (g) => g.planet.bio > 40,
		weight: (g) => (g.planet.bio - 35) / 8,
		apply: (g, fx) => {
			addMod(g, "ecoBoom", 4);
			g.res.biomass += 20;
			fx.push({
				kind: "milestone",
				key: "ev.ecoboom.applied",
				tone: "good"
			});
		}
	},
	{
		id: "aurora",
		kind: "choice",
		good: true,
		cond: (g) => g.planet.pressure > 20,
		weight: () => 2.5,
		options: [
			{
				key: "ev.aurora.a",
				apply: (g, fx) => {
					g.res.research += 18;
					fx.push({
						kind: "float",
						tile: g.hubIndex,
						text: "+18◉",
						tone: "good"
					});
				}
			},
			{
				key: "ev.aurora.b",
				apply: (g, fx) => {
					g.res.energy += 22;
					addMod(g, "geoSurge", 2);
					fx.push({
						kind: "float",
						tile: g.hubIndex,
						text: "+22⚡",
						tone: "good"
					});
				}
			},
			{
				key: "ev.aurora.c",
				apply: (g) => {
					floatPlanet(g, "stability", 4);
					floatPlanet(g, "bio", 2);
				}
			}
		]
	},
	{
		id: "seedship",
		kind: "choice",
		good: true,
		cond: (g) => g.cycle > 14 && g.planet.oxygen > 8,
		weight: () => 2,
		options: [
			{
				key: "ev.seedship.a",
				apply: (g, fx) => {
					g.res.biomass += 30;
					for (const t of g.tiles) if (BIOMES[t.biome].id !== "barren") t.fert = clamp(t.fert + 6, 0, 100);
					fx.push({
						kind: "float",
						tile: g.hubIndex,
						text: "+30❧",
						tone: "good"
					});
				}
			},
			{
				key: "ev.seedship.b",
				apply: (g, fx) => {
					g.res.minerals += 40;
					g.res.energy += 10;
					fx.push({
						kind: "float",
						tile: g.hubIndex,
						text: "+40⛁",
						tone: "good"
					});
				}
			},
			{
				key: "ev.seedship.c",
				apply: (g) => {
					addMod(g, "aquiferGuard", 10);
					floatPlanet(g, "stability", 3);
					floatPlanet(g, "bio", 3);
				}
			}
		]
	},
	{
		id: "geosurge",
		kind: "instant",
		good: true,
		cond: (g) => g.tiles.some((t) => t.geo === 1),
		weight: () => 2,
		apply: (g, fx) => {
			addMod(g, "geoSurge", 3);
			fx.push({
				kind: "milestone",
				key: "ev.geosurge.applied",
				tone: "good"
			});
		}
	}
];
var EVENT_MAP = new Map(EVENTS.map((e) => [e.id, e]));
/** roll for a new event; returns pendingChoice set */
function rollEvent(g, fx) {
	if (g.pendingChoice) return;
	let rng = g.rng;
	const pChance = clamp(.13 + (g.mode === "volcanic" ? .05 : 0) + (g.mode === "hardcore" ? .05 : 0) - g.planet.stability / 10 * .02, .05, .3);
	const [r, s] = rngFloat(rng);
	rng = s;
	if (r >= pChance) {
		g.rng = rng;
		return;
	}
	const eligible = EVENTS.filter((e) => e.cond(g));
	const weights = eligible.map((e) => Math.max(.1, e.weight(g)));
	const total = weights.reduce((a, b) => a + b, 0);
	const [pick, s2] = rngFloat(rng);
	rng = s2;
	let acc = pick * total;
	let ev;
	for (let i = 0; i < eligible.length; i++) {
		acc -= weights[i];
		if (acc <= 0) {
			ev = eligible[i];
			break;
		}
	}
	if (!ev) {
		g.rng = rng;
		return;
	}
	g.stats.eventsSeen++;
	if (ev.kind === "instant") {
		ev.apply(g, fx);
		g.recentEvents.push({
			eventId: ev.id,
			cycle: g.cycle
		});
	} else {
		g.pendingChoice = {
			eventId: ev.id,
			cycle: g.cycle
		};
		g.recentEvents.push({
			eventId: ev.id,
			cycle: g.cycle
		});
	}
	if (g.recentEvents.length > 30) g.recentEvents.shift();
	g.rng = rng;
}
function resolveChoice(g, option, fx) {
	if (!g.pendingChoice) return false;
	const ev = EVENTS.find((e) => e.id === g.pendingChoice.eventId);
	if (!ev || !ev.options || option < 0 || option >= ev.options.length) return false;
	ev.options[option].apply(g, fx);
	g.stats.decisionsMade++;
	g.recentEvents.push({
		eventId: ev.id,
		cycle: g.cycle,
		choice: ev.options[option].key
	});
	g.pendingChoice = null;
	fx.push({
		kind: "event",
		eventId: ev.id
	});
	return true;
}
/** multiplier from active modifiers for economy */
function economyMod(g) {
	const out = {
		energy: 1,
		water: 1,
		research: 1,
		minerals: 1,
		biomass: 1
	};
	for (const m of g.modifiers) {
		if (m.id === "solarFlare") out.energy *= .5;
		if (m.id === "geoSurge") out.energy *= 1.4;
		if (m.id === "aurora") out.research *= 1.25;
		if (m.id === "drought") out.water *= .7;
		if (m.id === "dustveil") out.energy *= .8;
	}
	return out;
}
//#endregion
//#region src/sim/victory.ts
/**
* Phases, victory/defeat, scoring and grade.
*/
function computePhase(g) {
	const p = g.planet;
	let ph = 1;
	if (p.oxygen >= 8 || p.water >= 25) ph = 2;
	if (ph >= 2 && (p.temp >= -5 || p.humidity >= 25)) ph = 3;
	if (ph >= 3 && p.bio >= 25) ph = 4;
	if (ph >= 4 && p.bio >= 45 && p.stability >= 50) ph = 5;
	if (ph >= 5 && p.bio >= 55 && p.stability >= 62 && g.techDone.length >= 10) ph = 6;
	return ph;
}
function computeScore(g) {
	const p = g.planet;
	const living = g.tiles.filter((t) => t.dev > 0).length;
	const life = p.bio * 22 + living * 3.2;
	const climate = p.stability * 12 + Math.max(0, 40 - Math.abs(p.temp - 10)) * 9;
	const water = p.water * 9 + biggestNetwork(g) * 6;
	const tech = g.techDone.length * 46;
	const networks = g.combos.length * 42;
	const habitats = g.tiles.filter((t) => t.structure === "habitat").length * 55;
	let objectives = 0;
	for (const o of g.objectives) {
		const def = getObjective(o.id);
		if (o.done && def) objectives += def.bonus / 6;
	}
	const efficiency = Math.max(0, 30 - g.cycle / 6) * 4 + p.oxygen * 3 + p.pressure * 1.2;
	const pollution = -p.pollution * 14;
	const raw = life + climate + water + tech + networks + habitats + objectives + efficiency + pollution + g.phase * 120;
	const total = Math.max(0, Math.round(raw * 2.2));
	return {
		life,
		climate,
		water,
		tech,
		networks,
		habitats,
		objectives,
		efficiency,
		pollution,
		total,
		grade: total >= 12500 ? "S+" : total >= 10500 ? "S" : total >= 9e3 ? "A+" : total >= 7800 ? "A" : total >= 6500 ? "B+" : total >= 5200 ? "B" : total >= 4e3 ? "C" : total >= 2800 ? "D" : "E"
	};
}
/** Check win / collapse each cycle. */
function checkEnd(g) {
	if (g.end) return null;
	if (primaryMet(g)) {
		g.stableCycles++;
		if (g.stableCycles >= 8) return "victory";
	} else g.stableCycles = Math.max(0, g.stableCycles - 1);
	if (g.planet.stability < 18 && g.cycle > 20) {
		g.crisis = (g.crisis ?? 0) + 1;
		if (g.crisis >= 6) return "collapse";
	} else g.crisis = Math.max(0, (g.crisis ?? 0) - 1);
	return null;
}
function finishGame(g, type) {
	const parts = computeScore(g);
	if (type === "collapse") {
		g.score = Math.round(parts.total * .45);
		const grade = g.score >= 6e3 ? "B" : g.score >= 4e3 ? "C" : g.score >= 2500 ? "D" : "E";
		g.end = {
			type,
			cycle: g.cycle,
			score: g.score,
			grade
		};
	} else {
		g.score = parts.total;
		g.end = {
			type,
			cycle: g.cycle,
			score: g.score,
			grade: parts.grade
		};
	}
	computeTerritory(g, 2);
}
//#endregion
//#region src/sim/turn.ts
/**
* The cycle pipeline. Every player placement (or wait) advances one cycle:
* placement → economy → research → climate → ecology → modifiers → events →
* objectives → phases → score → snapshot.
*/
var DEFAULT_CAPS = {
	water: 140,
	minerals: 160,
	energy: 110,
	biomass: 120,
	research: 200
};
function endCycle(g, fx) {
	g.cycle++;
	const agg = aggregateTechs(g);
	computeTerritory(g, 2 + agg.rangeAdd);
	const derived = deriveAll(g, agg);
	const prevKeys = new Set(g.combos.map((c) => `${c.id}:${[...c.tiles].sort((a, b) => a - b).join(",")}`));
	g.combos = derived.combosFound;
	for (const c of derived.combosFound) {
		const key = `${c.id}:${[...c.tiles].sort((a, b) => a - b).join(",")}`;
		if (!prevKeys.has(key)) {
			g.stats.combos++;
			fx.push({
				kind: "combo",
				id: c.id,
				tiles: c.tiles
			});
		}
	}
	const emod = economyMod(g);
	const soft = agg.softCapAdd;
	const capMult = (k, stock) => {
		const cap = DEFAULT_CAPS[k] + (soft[k] ?? 0);
		if (stock <= cap) return 1;
		return Math.max(.2, cap / stock);
	};
	const net = {
		water: derived.totals.prod.water * emod.water - derived.totals.use.water,
		minerals: derived.totals.prod.minerals * emod.minerals,
		energy: derived.totals.prod.energy * emod.energy - derived.totals.use.energy,
		biomass: derived.totals.prod.biomass,
		research: derived.totals.prod.research * emod.research
	};
	net.energy -= .35 + g.tiles.reduce((s, x) => s + (x.structure === "habitat" ? .15 : 0), 0);
	Object.keys(net).forEach((k) => {
		const gain = net[k] > 0 ? net[k] * capMult(k, g.res[k]) : net[k];
		g.res[k] = Math.max(0, g.res[k] + gain);
	});
	if (g.res.energy <= .5 && net.energy < 0) {
		g.planet.stability = Math.max(0, g.planet.stability - 1.1);
		if (g.cycle % 8 === 0) fx.push({
			kind: "milestone",
			key: "st.blackout",
			tone: "bad"
		});
	}
	if (g.techCurrent) {
		const def = TECHS[g.techCurrent];
		if (def && g.res.research >= def.cost && def.reqs.every((r) => g.techDone.includes(r))) {
			g.res.research -= def.cost;
			g.techDone.push(def.id);
			g.stats.techs = g.techDone.length;
			g.techCurrent = null;
			fx.push({
				kind: "unlock",
				what: "tech",
				id: def.id
			});
			for (const m of def.mods) {
				if (m.kind === "unlockBiome") fx.push({
					kind: "unlock",
					what: "biome",
					id: m.target
				});
				if (m.kind === "unlockStructure") fx.push({
					kind: "unlock",
					what: "structure",
					id: m.target
				});
			}
		} else if (def) g.techProgress = Math.min(1, g.res.research / def.cost);
	} else g.techProgress = 0;
	const prevLost = g.stats.tilesLost;
	stepPlanet(g, agg, derived, fx);
	stepTiles(g, agg, derived, fx);
	if (g.stats.tilesLost > prevLost) fx.push({
		kind: "milestone",
		key: "st.tilesLost",
		tone: "bad"
	});
	if (derived.powerDeficit && g.cycle % 4 === 0) fx.push({
		kind: "milestone",
		key: "st.powerDeficit",
		tone: "bad"
	});
	g.res.biomass += Math.max(0, derived.totals.prod.biomass * .25);
	g.modifiers = g.modifiers.filter((m) => {
		m.cycles--;
		return m.cycles > 0;
	});
	rollEvent(g, fx);
	for (const o of g.objectives) {
		if (o.done) continue;
		const def = getObjective(o.id);
		if (!def) continue;
		if (def.id === "primary_self_sustaining") continue;
		if (def.prog(g) >= 1) {
			o.done = true;
			fx.push({
				kind: "milestone",
				key: `obj.${o.id}.done`,
				tone: "good"
			});
		}
	}
	const ph = computePhase(g);
	if (ph !== g.phase) {
		g.phase = ph;
		fx.push({
			kind: "milestone",
			key: `phase.${ph}`,
			tone: "info"
		});
	}
	g.stats.peakBio = Math.max(g.stats.peakBio, g.planet.bio);
	g.stats.peakWater = Math.max(g.stats.peakWater, g.planet.water);
	const end = checkEnd(g);
	if (primaryMet(g) && !g.end) {
		if (g.stableCycles === 1) fx.push({
			kind: "milestone",
			key: "phase.selfsustaining",
			tone: "good"
		});
	}
	if (g.end === null && end) {
		finishGame(g, end);
		pushSnapshot(g, true);
		fx.push({
			kind: "milestone",
			key: end === "victory" ? "end.victory" : "end.collapse",
			tone: end === "victory" ? "good" : "bad"
		});
		return;
	}
	if (g.cycle % 3 === 0) pushSnapshot(g);
}
function act(state, action) {
	if (state.end && action.type === "place") return {
		state,
		fx: [],
		error: "err.gameOver"
	};
	const g = structuredClone(state);
	const fx = [];
	switch (action.type) {
		case "place":
			if (!applyPlacement(g, aggregateTechs(g), action.tile, fx, action.biome, action.structure)) return {
				state,
				fx: [],
				error: "err.invalid"
			};
			endCycle(g, fx);
			return {
				state: g,
				fx
			};
		case "wait":
			if (g.pendingChoice) return {
				state,
				fx: [],
				error: "err.chooseFirst"
			};
			endCycle(g, fx);
			return {
				state: g,
				fx
			};
		case "research": {
			const def = TECHS[action.tech];
			if (!def) return {
				state,
				fx: [],
				error: "err.noTech"
			};
			if (g.techDone.includes(def.id)) return {
				state,
				fx: [],
				error: "err.doneAlready"
			};
			if (!def.reqs.every((r) => g.techDone.includes(r))) return {
				state,
				fx: [],
				error: "err.reqs"
			};
			g.techCurrent = def.id;
			return {
				state: g,
				fx
			};
		}
		case "choice":
			if (!resolveChoice(g, action.option, fx)) return {
				state,
				fx: [],
				error: "err.invalid"
			};
			return {
				state: g,
				fx
			};
	}
}
/** continue after the ending (sandbox mode) */
function openSandbox(state) {
	const g = structuredClone(state);
	g.end = null;
	g.stableCycles = 0;
	return g;
}
//#endregion
//#region src/sim/serialize.ts
/**
* Save/load: versioned, validated, corruption-tolerant (graceful fallback,
* never crashes the game on a bad save).
*/
var SAVE_KEY = "terraform_save_v1";
var META_KEY = "terraform_meta_v1";
function loadMeta() {
	const def = {
		bestScores: {},
		runs: 0
	};
	try {
		const raw = localStorage.getItem(META_KEY);
		if (!raw) return def;
		const m = JSON.parse(raw);
		if (typeof m !== "object" || m === null) return def;
		return {
			bestScores: m.bestScores ?? {},
			runs: m.runs ?? 0,
			lastSeed: m.lastSeed,
			tutorialSeen: m.tutorialSeen
		};
	} catch {
		return def;
	}
}
function saveMeta(m) {
	try {
		localStorage.setItem(META_KEY, JSON.stringify(m));
	} catch {}
}
function saveGame(g) {
	try {
		localStorage.setItem(SAVE_KEY, JSON.stringify(g));
		return true;
	} catch {
		return false;
	}
}
function hasSave() {
	try {
		return !!localStorage.getItem(SAVE_KEY);
	} catch {
		return false;
	}
}
function clearSave() {
	try {
		localStorage.removeItem(SAVE_KEY);
	} catch {}
}
/** Validate a parsed save; returns a usable state or null. */
function validateSave(raw) {
	try {
		if (typeof raw !== "object" || raw === null) return null;
		const g = raw;
		if (g.version !== 3) return null;
		if (typeof g.seed !== "string" || typeof g.cycle !== "number") return null;
		if (!Array.isArray(g.tiles) || g.tiles.length !== 3 * g.mapR * (g.mapR + 1) + 1) return null;
		if (typeof g.hubIndex !== "number" || g.hubIndex < 0 || g.hubIndex >= g.tiles.length) return null;
		if (!g.planet || typeof g.planet.temp !== "number" || typeof g.planet.bio !== "number") return null;
		if (!g.res || typeof g.res.water !== "number") return null;
		if (!Array.isArray(g.rng ? [g.rng.a] : []) || typeof g.rng?.a !== "number") return null;
		const biomeSet = new Set(BIOME_ORDER);
		for (const t of g.tiles) {
			if (!biomeSet.has(t.biome)) t.biome = "barren";
			t.dev = Math.max(0, Math.min(3, Number(t.dev) || 0));
			t.moist = Math.max(0, Math.min(100, Number(t.moist) || 0));
			t.fert = Math.max(0, Math.min(100, Number(t.fert) || 0));
			t.poll = Math.max(0, Math.min(100, Number(t.poll) || 0));
			t.elev = Math.max(0, Math.min(5, Number(t.elev) || 0));
			if (t.structure === void 0) t.structure = null;
		}
		if (!Array.isArray(g.objectives) || g.objectives.length === 0) g.objectives = [{
			id: "primary_self_sustaining",
			done: false
		}];
		if (!Array.isArray(g.snapshots)) g.snapshots = [];
		if (typeof g.crisis !== "number") g.crisis = 0;
		return g;
	} catch {
		return null;
	}
}
function loadGame() {
	try {
		const raw = localStorage.getItem(SAVE_KEY);
		if (!raw) return null;
		return validateSave(JSON.parse(raw));
	} catch {
		return null;
	}
}
function dailySeed(date = /* @__PURE__ */ new Date()) {
	const y = date.getFullYear();
	const m = date.getMonth() + 1;
	const d = date.getDate();
	return `PLANET-${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function newGame(seed, mode, mapR = 12) {
	const g = blankState(seed, mode, mapR, "");
	generatePlanet(g);
	return g;
}
//#endregion
//#region tests/entry.ts
/** Local deterministic generator for the test bot (not part of game state). */
function mulberryRng(seed) {
	let a = seed >>> 0;
	return () => {
		a = a + 1831565813 | 0;
		let t = Math.imul(a ^ a >>> 15, 1 | a);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
//#endregion
export { BIOMES, BIOME_ORDER, COMBOS, EVENTS, EVENT_MAP, FREE_STRUCTURES, GRID_COMBO_STRUCTS, LIVING_BIOMES, MODE_CFG, NEI_KEYS, OBJECTIVE_POOL, PRIMARY, RES_IDS, SAVE_VERSION, STARTER_TECHS, STRUCTURES, STRUCTURE_ORDER, TECHS, TECH_BRANCHES, WATER_BIOMES, act, aggregateTechs, applyPlacement, biggestNetwork, biomeColorHex, biomeCost, biomeIndex, blankState, buildCtx, canAfford, chainReactions, checkEnd, checkPlacement, clearSave, computePhase, computeScore, computeTerritory, coordsOf, costText, dailySeed, deriveAll, devStage, economyMod, emptyYield, endCycle, findHubIndex, finishGame, generatePlanet, getObjective, hasSave, isBiomeUnlocked, isStructureUnlocked, loadGame, loadMeta, makeTile, mapIndex, mulberryRng, neighborsIdx, neighborsOfIdx, newGame, openSandbox, payCost, planetNameFor, previewPlacement, primaryMet, pushSnapshot, resolveChoice, rngOf, rollEvent, saveGame, saveMeta, scaleCost, seedNum, setRng, snapshotAt, stateHash, stepPlanet, stepTiles, structureCost, tileHex, tileIdxByKey, validateSave, withinDist };
