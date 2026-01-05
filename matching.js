import { sb } from "./app.js";

/**
 * 1. Haversine Formula
 * Calculates straight-line distance (as the crow flies) in km.
 * Essential for pre-filtering large donor databases before calling expensive APIs.
 */
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 2. Stage 1 Matching: Supabase Filter
 * Finds donors with matching blood type and performs initial distance sorting.
 */
export async function findMatches(patientBlood, patientCoords) {
  console.log(`AI Search: Finding ${patientBlood} donors...`);

  const { data: candidates, error } = await sb
    .from("donors")
    .select("*")
    .eq("blood_group", patientBlood)
    .eq("status", "active");

  if (error) {
    console.error("Database Error:", error);
    return [];
  }

  // Calculate mathematical distance
  const donorsWithDistance = candidates.map((donor) => {
    const distance = getDistance(
      patientCoords.lat,
      patientCoords.lng,
      donor.location.lat,
      donor.location.lng
    );
    return { ...donor, distance };
  });

  // Return top 10 for detailed traffic analysis
  return donorsWithDistance
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 10);
}

/**
 * 3. Stage 2 Matching: Real-Time Traffic Analysis
 * Uses Google Maps to find the donor who can ACTUALLY arrive the fastest.
 */
export async function getTravelData(origin, donors) {
  if (!donors || donors.length === 0) return [];

  const service = new google.maps.DistanceMatrixService();
  const destinations = donors.map((d) => ({
    lat: d.location.lat,
    lng: d.location.lng,
  }));

  return new Promise((resolve, reject) => {
    service.getDistanceMatrix(
      {
        origins: [origin],
        destinations: destinations,
        travelMode: google.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: "bestguess",
        },
      },
      (response, status) => {
        if (status !== "OK") {
          console.error("Traffic API Error:", status);
          return reject(status);
        }

        // Merge traffic data with donor profiles
        const results = response.rows[0].elements.map((element, index) => ({
          ...donors[index],
          travelTimeText: element.duration?.text || "N/A",
          travelTimeValue: element.duration?.value || 999999, // in seconds
          travelDistance: element.distance?.text || "N/A",
        }));

        // Final sort by actual travel time (not just distance)
        results.sort((a, b) => a.travelTimeValue - b.travelTimeValue);
        resolve(results);
      }
    );
  });
}
