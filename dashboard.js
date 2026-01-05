import { sb } from "./app.js";

const tableBody = document.getElementById("donorTableBody");

/**
 * 1. INITIAL LOAD
 * Pulls the most recent broadcast and finds matching donors
 */
async function initDashboard() {
  const { data: emergencies, error: err1 } = await sb
    .from("emergency_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  if (err1) return console.error("Error fetching emergency:", err1.message);

  if (emergencies && emergencies.length > 0) {
    const activeReq = emergencies[0];
    updateHeader(activeReq);
    loadMatchedDonors(activeReq.blood_group, activeReq.patient_name);
  }
}

/**
 * 2. UPDATE HEADER
 */
function updateHeader(request) {
  document.getElementById("reqbloodGroup").innerText = request.blood_group;
  document.getElementById("reqHospitalName").innerText = request.hospital_name;
}

/**
 * 3. LOAD DONORS
 */
async function loadMatchedDonors(bloodGroup, patientName) {
  const { data: donors, error } = await sb
    .from("donors")
    .select("*")
    .eq("blood_group", bloodGroup)
    .or("status.eq.notified,status.eq.accepted");

  if (error) return console.error("Error loading donors:", error);

  tableBody.innerHTML = "";
  donors.forEach((donor) => addDonorRow(donor, patientName));
}

/**
 * 4. ADD/UPDATE TABLE ROW
 * Refined to show "Call" button only when accepted
 */
function addDonorRow(donor, patientName = "Emergency Case") {
  let row = document.getElementById(`donor-${donor.id}`);

  const isAccepted = donor.status === "accepted";
  const statusClass = isAccepted ? "accepted" : "searching";
  const statusText = isAccepted ? "✅ ON THE WAY" : "⏳ NOTIFIED";

  // Privacy Logic: Show phone number only if status is accepted
  const contactInfo = isAccepted
    ? `<a href="tel:${donor.phone}" style="color:var(--primary-red); font-weight:bold; text-decoration:none;">📞 CALL ${donor.phone}</a>`
    : `<span style="color:#999; font-style:italic;">Hidden</span>`;

  const rowHTML = `
    <td><strong>${patientName}</strong></td>
    <td>${donor.name}</td>
    <td>${contactInfo}</td>
    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
  `;

  if (row) {
    row.innerHTML = rowHTML;
  } else {
    const newRow = document.createElement("tr");
    newRow.id = `donor-${donor.id}`;
    newRow.innerHTML = rowHTML;
    tableBody.appendChild(newRow);
  }
}

/**
 * 5. REAL-TIME LISTENERS (The "Live" Part)
 */

// Listener for NEW emergency broadcasts
sb.channel("new-emergencies")
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "emergency_requests" },
    (payload) => {
      updateHeader(payload.new);
      loadMatchedDonors(payload.new.blood_group, payload.new.patient_name);
    }
  )
  .subscribe();

// Listener for DONOR interaction (Accept/Reject)
sb.channel("donor-updates")
  .on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "donors" },
    (payload) => {
      // If donor status changes, refresh their specific row
      if (
        payload.new.status === "accepted" ||
        payload.new.status === "notified"
      ) {
        addDonorRow(payload.new);
      }

      // If a donor becomes active again (rejects/cancels), remove them from the live list
      if (payload.new.status === "active") {
        const rowToRemove = document.getElementById(`donor-${payload.new.id}`);
        if (rowToRemove) rowToRemove.remove();
      }
    }
  )
  .subscribe();

initDashboard();
