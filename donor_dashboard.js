import { sb as supabase } from "./app.js";

const myId = localStorage.getItem("myId");
const alertBox = document.getElementById("emergencyAlert");

/**
 * 1. AUTH GUARD
 * Ensure the donor is logged in
 */
async function checkAuth() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session && !myId) {
    window.location.href = "login.html";
  }
}

/**
 * 2. INITIALIZE REAL-TIME LISTENER
 * Listens specifically for this donor's ID being updated to 'notified'
 */
function listenForRequests() {
  console.log("Listening for emergency broadcasts...");

  supabase
    .channel(`donor-tracking-${myId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "donors",
        filter: `id=eq.${myId}`,
      },
      (payload) => {
        console.log("Status change detected:", payload.new.status);
        if (payload.new.status === "notified") {
          showEmergencyUI(payload.new.current_request_id);
        }
        if (payload.new.status === "active") {
          // If hospital cancels or donor is released
          alertBox.classList.add("hidden");
        }
      }
    )
    .subscribe();
}

/**
 * 3. SHOW EMERGENCY UI
 * Displays the hospital details without revealing private contact info yet
 */
async function showEmergencyUI(requestId) {
  const { data: request, error } = await supabase
    .from("emergency_requests")
    .select("hospital_name, blood_group, address")
    .eq("id", requestId)
    .single();

  if (error) return console.error("Error fetching request:", error);

  if (request) {
    alertBox.classList.remove("hidden");
    alertBox.innerHTML = `
        <div class="alert-content" style="padding: 20px; border: 2px solid var(--primary-red); border-radius: 10px;">
            <h2 style="color: var(--primary-red); margin-bottom: 5px;">🚨 URGENT REQUEST</h2>
            <p style="margin: 5px 0;"><strong>Hospital:</strong> ${request.hospital_name}</p>
            <p style="margin: 5px 0;"><strong>Blood Needed:</strong> ${request.blood_group}</p>
            <p style="margin: 5px 0; font-size: 0.9rem; color: #666;"><strong>Location:</strong> ${request.address}</p>
            
            <p style="color: #d32f2f; font-size: 0.75rem; margin-top: 15px; font-weight: 600;">
                *Clicking Accept will share your contact with the medical team*
            </p>
            
            <div style="display: flex; gap: 10px; margin-top: 15px;">
                <button id="acceptBtn" class="submit-btn" style="background: #2ecc71; margin: 0;">ACCEPT & HELP</button>
                <button id="rejectBtn" class="secondary-btn" style="margin: 0;">DECLINE</button>
            </div>
        </div>
    `;

    document.getElementById("acceptBtn").onclick = () =>
      acceptEmergency(requestId, request);
    document.getElementById("rejectBtn").onclick = () => declineEmergency();
  }
}

/**
 * 4. ACCEPT EMERGENCY
 * The "Handshake" - Reveal donor info to hospital and hospital info to donor
 */
async function acceptEmergency(requestId, requestDetails) {
  const btn = document.getElementById("acceptBtn");
  btn.innerText = "Processing...";
  btn.disabled = true;

  // Update donor status to 'accepted'
  const { error: updateError } = await supabase
    .from("donors")
    .update({ status: "accepted" })
    .eq("id", myId);

  if (updateError) {
    alert("Connection error. Try again.");
    btn.disabled = false;
    return;
  }

  // Fetch hospital contact info (Assuming you have a contact field in emergency_requests)
  const { data: contactData } = await supabase
    .from("emergency_requests")
    .select("hospital_name, patient_name")
    .eq("id", requestId)
    .single();

  // Update UI to Success State
  alertBox.innerHTML = `
        <div class="success-content" style="text-align: center; padding: 20px;">
            <h2 style="color: #2ecc71;">YOU ARE A HERO! ✅</h2>
            <p>The medical team at <strong>${
              requestDetails.hospital_name
            }</strong> has been notified.</p>
            <p>Please proceed to: <br> <small>${
              requestDetails.address
            }</small></p>
            <hr style="margin: 15px 0; border: 0; border-top: 1px solid #eee;">
            <p style="font-size: 0.9rem;">Patient Name: <strong>${
              contactData.patient_name || "Emergency Case"
            }</strong></p>
            <button onclick="window.location.reload()" class="secondary-btn">Back to Dashboard</button>
        </div>
    `;
}

/**
 * 5. DECLINE EMERGENCY
 */
async function declineEmergency() {
  await supabase.from("donors").update({ status: "active" }).eq("id", myId);
  alertBox.classList.add("hidden");
}

// Initialization
checkAuth();
listenForRequests();
