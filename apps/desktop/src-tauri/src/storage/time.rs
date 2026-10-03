//! Timestamps in the format of JavaScript's `Date.prototype.toISOString()`.

use std::time::{SystemTime, UNIX_EPOCH};

/// The current time as `YYYY-MM-DDTHH:mm:ss.sssZ` (UTC). Fixed width, so strings sort by time.
pub(crate) fn now_iso() -> String {
    let since_epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format_iso(u64::try_from(since_epoch.as_millis()).unwrap_or(u64::MAX))
}

/// Formats milliseconds since the Unix epoch. The date part is Howard Hinnant's
/// `civil_from_days`, restricted to dates after 1970.
fn format_iso(millis_since_epoch: u64) -> String {
    let millis = millis_since_epoch % 1000;
    let seconds = millis_since_epoch / 1000;
    let (hour, minute, second) = (seconds / 3600 % 24, seconds / 60 % 60, seconds % 60);

    // Days since 0000-03-01, split into 400-year eras.
    let days = seconds / 86_400 + 719_468;
    let (era, day_of_era) = (days / 146_097, days % 146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    // Months counted from March, so the leap day is the last day of the year.
    let month_from_march = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_from_march + 2) / 5 + 1;
    let month = if month_from_march < 10 {
        month_from_march + 3
    } else {
        month_from_march - 9
    };
    let year = year_of_era + era * 400 + u64::from(month <= 2);

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_like_to_iso_string() {
        assert_eq!(format_iso(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(format_iso(951_782_400_000), "2000-02-29T00:00:00.000Z");
        assert_eq!(format_iso(951_868_799_999), "2000-02-29T23:59:59.999Z");
        assert_eq!(format_iso(1_700_000_000_123), "2023-11-14T22:13:20.123Z");
        assert_eq!(format_iso(1_735_689_600_000), "2025-01-01T00:00:00.000Z");
        assert_eq!(format_iso(4_102_444_799_000), "2099-12-31T23:59:59.000Z");
    }

    #[test]
    fn now_has_the_fixed_width_shape() {
        let now = now_iso();
        assert_eq!(now.len(), 24);
        assert!(now.ends_with('Z'));
        assert!(now.as_str() > "2026-01-01T00:00:00.000Z");
    }
}
