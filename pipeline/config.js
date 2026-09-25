// Single place to widen the region or swap a source.
const SAGIS = 'https://pub.sagis.org/arcgis/rest/services';

export const PIPELINE_CONFIG = {
  region: {
    name: 'Savannah region',
    center: [-81.1, 32.08],
    radiusMiles: 40, // every ZCTA whose boundary touches this circle is included
    states: ['GA', 'SC'],
  },
  outputDir: new URL('../public/data/', import.meta.url),
  // Hours before a cached source is refetched. Zillow publishes mid-month, Redfin monthly,
  // SAGIS parcels/permits weekly, ACS yearly.
  ttlHours: { zctas: 24 * 90, zillow: 24 * 7, redfin: 24 * 14, acs: 24 * 60, parcels: 24 * 6, projects: 24 * 3, listings: 12 },
  soldWindowMonths: 24,
  sources: {
    zcta: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/11',
    zhvi: 'https://files.zillowstatic.com/research/public_csvs/zhvi/Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv',
    zori: 'https://files.zillowstatic.com/research/public_csvs/zori/Zip_zori_uc_sfrcondomfr_sm_month.csv',
    zhvf: 'https://files.zillowstatic.com/research/public_csvs/zhvf_growth/Zip_zhvf_growth_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv',
    redfinZip: 'https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/zip_code_market_tracker.tsv000.gz',
    acs: 'https://api.censusreporter.org/1.0/data/show',
    parcelsCurrent: `${SAGIS}/MPC/DevServices_AgendaItems/MapServer/4`,
    parcelDigest: (year) => `${SAGIS}/OpenData/Parcels/MapServer/${year - 1998}`, // layer 18 = 2016 … 27 = 2025
    capitalProjects: `${SAGIS}/SavannahCIP/CapitalImprovementProjects_MapService/MapServer/0`,
    transportPoints: `${SAGIS}/MPC/2050_MTP_Moving_Forward_Together/MapServer/0`,
    transportSegments: `${SAGIS}/MPC/2050_MTP_Moving_Forward_Together/MapServer/1`,
    rezonings: `${SAGIS}/Savannah/ZoningDevelopment_Map/MapServer/13`,
    residentialPermits: `${SAGIS}/Savannah/ZoningDevelopment_Map/MapServer/10`,
    commercialPermits: `${SAGIS}/Savannah/ZoningDevelopment_Map/MapServer/11`,
    mpcAgenda: `${SAGIS}/MPC/Agenda_items/MapServer/0`,
    rentcast: 'https://api.rentcast.io/v1/listings/sale',
  },
  parcelHistoryYears: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
  residentialUseCodes: ['R3'],
  rentcast: { maxRequests: Number(process.env.RENTCAST_MAX_REQUESTS || 8), pageSize: 500, inactiveDays: 120 },
};
