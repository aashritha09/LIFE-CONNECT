importScripts(
  "https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js"
);

// 1. Initialize Firebase in the Service Worker
// Note: Use your actual project credentials here
firebase.initializeApp({
  apiKey: "AIzaSyDc0Lae6BjZHVdX128FPk6d0F7aIlKhvME",
  projectId: "life---connect",
  messagingSenderId: "91655987938",
  appId: "1:91655987938:web:e7e4a75d9d1e4beaac34bb",
});

const messaging = firebase.messaging();

/**
 * 2. Background Message Handler
 * This triggers when a push is received and the app is NOT in the foreground.
 */
messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Background message received:",
    payload
  );

  const notificationTitle =
    payload.notification.title || "🚨 URGENT: Blood Request";
  const notificationOptions = {
    body: payload.notification.body || "A patient needs your help immediately.",
    icon: "https://cdn-icons-png.flaticon.com/512/822/822115.png", // Medical/Blood icon
    badge: "https://cdn-icons-png.flaticon.com/512/822/822115.png",
    tag: "emergency-request", // Prevents multiple notifications from stacking
    data: {
      url: "/donor_dashboard.html", // The page to open on click
    },
  };

  return self.registration.showNotification(
    notificationTitle,
    notificationOptions
  );
});

/**
 * 3. Notification Click Logic
 * Ensures the donor is taken directly to the dashboard to respond.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // If a tab is already open, focus it
        for (const client of clientList) {
          if (
            client.url.includes("donor_dashboard.html") &&
            "focus" in client
          ) {
            return client.focus();
          }
        }
        // Otherwise, open a new tab
        if (clients.openWindow) {
          return clients.openWindow("/donor_dashboard.html");
        }
      })
  );
});
