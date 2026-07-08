# User Flows — MedicationTracker

Living source of truth for what the site does. Update this file with every feature and bug fix.

## Add a medication
**Status:** Implemented
**Flow:**
1. User fills in Name, Dose, and Time in the "Add a medication" form
2. User clicks "Add medication"
3. If any field is empty, an inline error message is shown (`role="alert"`) and nothing is saved
4. On success, the medication appears in the "Your medications" list and the form is cleared
5. The medication persists across page reloads (stored in `localStorage`)

## View medications
**Status:** Implemented
**Flow:**
1. On page load, previously logged medications are read from `localStorage` and rendered in a list
2. If there are no medications (including corrupted/missing stored data), an empty-state message ("No medications logged yet.") is shown instead of the list

## Remove a medication
**Status:** Implemented
**Flow:**
1. User clicks "Remove" next to a medication in the list
2. The medication is removed from the list and from `localStorage` immediately
3. If it was the last medication, the empty-state message is shown again
