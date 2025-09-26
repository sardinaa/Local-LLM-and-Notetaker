from __future__ import annotations

from typing import List

# Supported countries for JobSpy (mirrors legacy definitions from monolith)
VALID_JOBSPY_COUNTRIES = {
    'us', 'united states', 'usa', 'canada', 'uk', 'united kingdom', 'ireland', 'germany', 'france',
    'spain', 'italy', 'portugal', 'netherlands', 'belgium', 'sweden', 'norway', 'denmark', 'finland',
    'switzerland', 'austria', 'poland', 'czech republic', 'hungary', 'romania', 'bulgaria', 'greece',
    'australia', 'new zealand', 'india', 'singapore', 'japan', 'south korea', 'brazil', 'mexico'
}


def validate_jobspy_locations(locations: List[str]) -> List[str]:
    """Validate a list of target locations against supported countries.

    Returns a list of error messages; empty if all valid.
    """
    errors: List[str] = []
    for location in locations or []:
        if not location:
            continue
        location_lower = location.strip().lower()
        if location_lower in VALID_JOBSPY_COUNTRIES:
            continue
        # Allow country name prefixes (e.g., "United" in "United States")
        if any(location_lower in country for country in VALID_JOBSPY_COUNTRIES):
            continue
        errors.append(
            f'"{location}" is not supported by JobSpy. Valid countries are: '
            + ", ".join(sorted(VALID_JOBSPY_COUNTRIES))
        )
    return errors

