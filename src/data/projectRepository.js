// A swappable development-pipeline adapter. These entries are sourced from
// current City of Savannah plans and agendas; the impact values are scenario
// assumptions, not appraisals.
const SAVANNAH_PROJECTS = [
  {
    id: 'canal-district', name: 'Canal District · Common Ground', type: 'Mixed use', status: 'Master plan adopted',
    phase: 'Long-range', coordinates: [-81.1124, 32.0735], radiusMiles: 1.8, modeledLift: 6.2,
    summary: 'Housing, public realm, mobility and city-owned land activation west of downtown.',
    source: 'City of Savannah', sourceUrl: 'https://savannahga.gov/1673/Canal-District',
  },
  {
    id: 'civic-legacy', name: 'Civic Legacy Project', type: 'Civic', status: 'In progress',
    phase: '2026–27', coordinates: [-81.0966, 32.0755], radiusMiles: 0.9, modeledLift: 4.8,
    summary: 'Arena removal and the first phase of a long-term civic-center site revitalization.',
    source: 'City of Savannah', sourceUrl: 'https://savannahga.gov/m/newsflash/home/detail/3303',
  },
  {
    id: 'river-street', name: 'River Street Mobility', type: 'Infrastructure', status: 'Preliminary design',
    phase: 'Planned', coordinates: [-81.0875, 32.0818], radiusMiles: 1.15, modeledLift: 3.4,
    summary: 'Waterfront multimodal path, access and ADA improvement planning.',
    source: 'City project update', sourceUrl: 'https://agenda.savannahga.gov/content/files/1-tourism-product-development-project-update-presentation.pdf',
  },
  {
    id: 'dawes-homes', name: 'Dawes Avenue Homes', type: 'Residential', status: 'Zoning approved',
    phase: 'Planned', coordinates: [-81.202, 32.044], radiusMiles: 0.85, modeledLift: 2.3,
    summary: '32 homes, a mixed-use community building and dedicated garden/park space.',
    source: 'Savannah City Council', sourceUrl: 'https://agenda.savannahga.gov/publishing/january-22-2026-city-council-regular-meeting/1543_11948.html',
  },
  {
    id: 'argyle-grove', name: 'Argyle Grove', type: 'Mixed use', status: 'Zoning petition',
    phase: 'Proposed', coordinates: [-81.311, 32.037], radiusMiles: 2.2, modeledLift: 4.1,
    summary: 'A proposed 274-acre residential, commercial and mixed-use district in west Savannah.',
    source: 'Savannah City Council', sourceUrl: 'https://agenda.savannahga.gov/publishing/june-25-2026-city-council-regular-meeting/agenda.html',
  },
];

export class ProjectRepository {
  async load() { return structuredClone(SAVANNAH_PROJECTS); }
}
