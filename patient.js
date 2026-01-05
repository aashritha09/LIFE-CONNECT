import { sb as supabase } from "./app.js";
import { getTravelData } from "./matching.js";

// --- 1. AUTHENTICATION GUARD ---
async function protectPortal() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    alert("Access Denied. Please login first.");
    window.location.href = "login.html";
  }
}
protectPortal();

let hospitalCoords = null;
let currentRequestId = null;

/**
 * 2. FIREBASE PUSH NOTIFICATION
 * Triggers a real-time mobile/browser alert for the donor
 */
async function sendPushNotification(fcmToken, bloodType, donorName) {
  if (!fcmToken) return;

  const PROJECT_ID = "life---connect";
  const url = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;
  const accessToken = "YOUR_ACCESS_TOKEN"; // Replace with your logic to get fresh token

  const message = {
    message: {
      token: fcmToken,
      notification: {
        title: "🚨 URGENT: Blood Needed!",
        body: `Hello ${donorName}, a patient needs ${bloodType} blood immediately. Can you help?`,
      },
      webpush: {
        fcm_options: {
          link: "https://your-project-url.web.app/donor_dashboard.html",
        },
      },
    },
  };

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });
  } catch (err) {
    console.error("FCM Error:", err);
  }
}

// 3. Detect Hospital Location
document.getElementById("hospLocBtn").onclick = () => {
  navigator.geolocation.getCurrentPosition(
    (p) => {
      hospitalCoords = { lat: p.coords.latitude, lng: p.coords.longitude };
      const status = document.getElementById("addressDisplay");
      status.innerText = "✅ GPS Location Locked";
      status.style.color = "green";
      // Store in hidden fields for the form submission
      document.getElementById("lat").value = p.coords.latitude;
      document.getElementById("lng").value = p.coords.longitude;
    },
    () => alert("Please enable GPS for emergency tracking.")
  );
};

// 4. Handle Request Submission
document.getElementById("requestForm").onsubmit = async (e) => {
  e.preventDefault();
  if (!hospitalCoords) return alert("Please lock hospital location first!");

  const bloodGroup = document.getElementById("blood_group").value;
  const btn = document.getElementById("submitBtn");
  btn.innerText = "Finding Best Matches...";
  btn.disabled = true;

  try {
    // Insert request into Supabase
    const { data: reqData, error: dbError } = await supabase
      .from("emergency_requests")
      .insert([
        {
          patient_name: document.getElementById("patientName").value,
          hospital_name: document.getElementById("hospitalName").value,
          blood_group: bloodGroup,
          coords: hospitalCoords,
          status: "searching",
        },
      ])
      .select();

    if (dbError) throw dbError;
    currentRequestId = reqData[0].id;

    // Trigger AI Ranking
    await processEmergency(bloodGroup, hospitalCoords);
  } catch (error) {
    alert("Broadcast Failed: " + error.message);
    btn.disabled = false;
  }
};

// 5. AI Matching Logic (Google Maps Matrix Integration)
async function processEmergency(bloodNeeded, hospitalLocation) {
  const { data: donorList, error } = await supabase
    .from("donors")
    .select("id, name, location, blood_group, status, fcm_token")
    .eq("blood_group", bloodNeeded)
    .eq("status", "active");

  if (error) throw error;

  const resultsDiv = document.getElementById("resultsSection") || document.body; // Fallback

  if (!donorList || donorList.length === 0) {
    alert("No active donors found for " + bloodNeeded);
    return;
  }

  // Calculate distances using your matching.js utility
  const donorCoords = donorList.map((d) => ({
    lat: d.location.lat,
    lng: d.location.lng,
  }));
  try {
    const travelResults = await getTravelData(hospitalLocation, donorCoords);
    rankAndDisplayDonors(donorList, travelResults.rows[0].elements);
  } catch (err) {
    console.error("Distance Matrix Error:", err);
  }
}

// 6. Ranking & UI Display
function rankAndDisplayDonors(donors, googleElements) {
  const rankedDonors = donors
    .map((donor, index) => ({
      ...donor,
      timeText: googleElements[index].duration?.text || "N/A",
      timeVal: googleElements[index].duration?.value || 999999,
    }))
    .sort((a, b) => a.timeVal - b.timeVal);

  // Clear and Show Results
  const list = document.createElement("div");
  list.id = "resultsSection";
  list.innerHTML = `<h3>Found ${rankedDonors.length} Matches</h3>`;

  rankedDonors.slice(0, 5).forEach((donor) => {
    const item = document.createElement("div");
    item.className = "stat-card";
    item.style.marginBottom = "10px";
    item.innerHTML = `
      <strong>${donor.name}</strong> - ${donor.timeText} away
      <button id="alert-${donor.id}" class="submit-btn" style="padding:5px; margin:0; width:100px; float:right;">ALERT</button>
    `;
    list.appendChild(item);

    setTimeout(() => {
      document.getElementById(`alert-${donor.id}`).onclick = () =>
        notifySingleDonor(
          donor.id,
          donor.name,
          donor.fcm_token,
          donor.blood_group
        );
    }, 0);
  });
  document.querySelector(".form-card").appendChild(list);
}

// 7. Notify Donor & Listen for Success
async function notifySingleDonor(id, name, token, blood) {
  const btn = document.getElementById(`alert-${id}`);
  btn.innerText = "Pinging...";

  await supabase
    .from("donors")
    .update({
      status: "notified",
      current_request_id: currentRequestId,
    })
    .eq("id", id);

  await sendPushNotification(token, blood, name);
  btn.innerText = "Sent 🚨";

  // Real-time listener for when THIS specific donor accepts
  supabase
    .channel(`accept-${id}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "donors",
        filter: `id=eq.${id}`,
      },
      (payload) => {
        if (payload.new.status === "accepted") {
          showSuccessHero(payload.new);
        }
      }
    )
    .subscribe();
}

function showSuccessHero(donor) {
  document.querySelector(".form-card").innerHTML = `
        <div class="alert-box pulse-red">
            <h2 style="color:var(--success-green)">HERO FOUND!</h2>
            <p><strong>${donor.name}</strong> is responding.</p>
            <a href="tel:${donor.phone}" class="submit-btn" style="background:var(--success-green); text-decoration:none; display:block;">📞 CALL ${donor.phone}</a>
        </div>
    `;
}
