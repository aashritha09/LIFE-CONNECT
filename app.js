import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// 1. Initialize Supabase Client
const supabaseUrl = "https://oxlkycbtwqnizzfpymei.supabase.co";
const supabaseKey = "sb_publishable_LQ2CWbr3PqDivuDLIVT3sA_dPNaewtC";

export const sb = createClient(supabaseUrl, supabaseKey);
export const supabase = sb;

/**
 * 2. Function: Register Donor (Updated to ensure ID is saved)
 */
export async function registerDonor(donorData) {
  const { data, error } = await sb
    .from("donors")
    .insert([
      {
        name: donorData.name,
        blood_group: donorData.blood_group,
        phone: donorData.phone,
        location: donorData.location,
        is_eligible: donorData.is_eligible ?? true,
        status: "active",
        fcm_token: donorData.fcm_token || null,
      },
    ])
    .select();

  if (!error && data && data.length > 0) {
    // Save to localStorage so the dashboard knows who "I" am
    localStorage.setItem("myId", data[0].id);
  }

  return { success: !error, data: data ? data[0] : null, error };
}

/**
 * 3. Function: Create Emergency Request (The Trigger)
 */
export async function createEmergencyRequest(requestData) {
  const { data, error } = await sb
    .from("emergency_requests")
    .insert([
      {
        patient_name: requestData.patient_name,
        hospital_name: requestData.hospital_name,
        blood_group: requestData.blood_group,
        location: requestData.location,
        status: "searching",
      },
    ])
    .select();

  if (!error && data) {
    // IMPORTANT: This part "wakes up" the donors
    await sb
      .from("donors")
      .update({ status: "notified" })
      .eq("blood_group", requestData.blood_group)
      .eq("status", "active");
  }

  return { success: !error, data: data ? data[0] : null, error };
}

/**
 * 4. REAL-TIME LISTENER (New Connection Logic)
 * This function allows the Donor Dashboard to react instantly
 */
export function listenForAlerts(donorId, onUpdate) {
  return sb
    .channel("any")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "donors",
        filter: `id=eq.${donorId}`,
      },
      (payload) => {
        onUpdate(payload.new);
      }
    )
    .subscribe();
}

/**
 * 5. Helper: Update Donor Status
 */
export async function updateDonorStatus(donorId, newStatus) {
  const { error } = await sb
    .from("donors")
    .update({ status: newStatus })
    .eq("id", donorId);
  return { success: !error, error };
}

// Auth Helpers
export async function signUp(email, password) {
  return await sb.auth.signUp({ email, password });
}

export async function signIn(email, password) {
  const res = await sb.auth.signInWithPassword({ email, password });
  if (res.data?.user) {
    localStorage.setItem("myId", res.data.user.id);
  }
  return res;
}

export async function signOut() {
  await sb.auth.signOut();
  localStorage.removeItem("myId");
  window.location.href = "landing.html";
}

export async function checkUser() {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    window.location.href = "index.html";
  }
  return user;
}
