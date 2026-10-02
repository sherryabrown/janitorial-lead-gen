# Arkansas municipality import review

Source snapshot: `outputs/arkansas-municipalities-2026-10-02-interior.json` (2026-10-02)

The GIS snapshot contains **501 incorporated municipalities**. 52 have land in more than one county. All place codes and county IDs are present.

**33 county-link differences:** each GIS difference adds a county; none removes a Census county.

**Recommendation:** Use the current Arkansas GIS county links for import. The older Census links are retained for historical references.

| Municipality | Existing Census counties | Current Arkansas GIS counties | Change |
| --- | --- | --- | --- |
| Antoine | Pike County | Clark County, Pike County | Adds Clark County |
| Barling | Sebastian County | Crawford County, Sebastian County | Adds Crawford County |
| Bull Shoals | Marion County | Baxter County, Marion County | Adds Baxter County |
| Cabot | Lonoke County | Lonoke County, Pulaski County | Adds Pulaski County |
| Calico Rock | Izard County | Izard County, Stone County | Adds Stone County |
| Caulksville | Logan County | Franklin County, Logan County | Adds Franklin County |
| Charleston | Franklin County | Franklin County, Sebastian County | Adds Sebastian County |
| Conway | Faulkner County | Conway County, Faulkner County | Adds Conway County |
| Fordyce | Dallas County | Calhoun County, Dallas County | Adds Calhoun County |
| Fort Smith | Sebastian County | Crawford County, Sebastian County | Adds Crawford County |
| Fulton | Hempstead County | Hempstead County, Miller County | Adds Miller County |
| Gilmore | Crittenden County | Crittenden County, Mississippi County, Poinsett County | Adds Mississippi County, Poinsett County |
| Glenwood | Montgomery County, Pike County | Clark County, Montgomery County, Pike County | Adds Clark County |
| Jacksonville | Pulaski County | Lonoke County, Pulaski County | Adds Lonoke County |
| Keo | Lonoke County | Lonoke County, Pulaski County | Adds Pulaski County |
| Leachville | Mississippi County | Craighead County, Mississippi County | Adds Craighead County |
| Little Rock | Pulaski County | Pulaski County, Saline County | Adds Saline County |
| Maumelle | Pulaski County | Faulkner County, Pulaski County | Adds Faulkner County |
| Mount Vernon | Faulkner County | Faulkner County, White County | Adds White County |
| Mulberry | Crawford County | Crawford County, Franklin County | Adds Franklin County |
| Nashville | Howard County | Hempstead County, Howard County | Adds Hempstead County |
| O'Kean | Randolph County | Greene County, Randolph County | Adds Greene County |
| Oxford | Izard County | Fulton County, Izard County | Adds Fulton County |
| Ratcliff | Logan County | Franklin County, Logan County | Adds Franklin County |
| Ravenden | Lawrence County | Lawrence County, Randolph County, Sharp County | Adds Randolph County, Sharp County |
| Reyno | Randolph County | Clay County, Randolph County | Adds Clay County |
| Sedgwick | Lawrence County | Craighead County, Greene County, Lawrence County | Adds Craighead County, Greene County |
| Shannon Hills | Saline County | Pulaski County, Saline County | Adds Pulaski County |
| Smackover | Union County | Ouachita County, Union County | Adds Ouachita County |
| Traskwood | Saline County | Hot Spring County, Saline County | Adds Hot Spring County |
| Tull | Grant County | Grant County, Saline County | Adds Saline County |
| Van Buren | Crawford County | Crawford County, Sebastian County | Adds Sebastian County |
| Wheatley | St. Francis County | Lee County, Monroe County, St. Francis County | Adds Lee County, Monroe County |

Sources: [Arkansas GIS municipal boundaries](https://gis.arkansas.gov/product/municipal-boundaries-polygon/) and [county boundaries](https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Boundaries/FeatureServer/48). County links use polygon interior overlap; a shared border alone does not count.
