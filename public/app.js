
const activityForm = document.getElementById("activity-form");
const activityMessage = document.getElementById("activity-message");
const statsMessage = document.getElementById("stats-message");
const centresMessage = document.getElementById("centres-message");
const centresList = document.getElementById("centres-list");
const searchInput = document.getElementById("centre-search");
const materialFilter = document.getElementById("material-filter");
const searchButton = document.getElementById("search-centres");

let allCentres = [];

// Load real impact statistics from the backend
function loadStats() {
  fetch("/api/stats")
    .then(function (response) {
      if (!response.ok) {
        throw new Error("Could not load statistics.");
      }
      return response.json();
    })
    .then(function (stats) {
      document.getElementById("stat-activities").textContent =
        Number(stats.recordedActivities).toLocaleString();

      document.getElementById("stat-kilograms").textContent =
        Number(stats.recordedKilograms).toLocaleString(
          undefined,
          { maximumFractionDigits: 2 }
        ) + " kg";

      document.getElementById("stat-centres").textContent =
        Number(stats.verifiedCentres).toLocaleString();

      statsMessage.textContent =
        "Statistics reflect records currently saved in the database.";
    })
    .catch(function (error) {
      statsMessage.textContent =
        "Statistics are temporarily unavailable. Please refresh to try again.";

      console.error(error);
    });
}

// Load verified recycling centres
function loadCentres() {
  centresList.innerHTML =
    '<p class="empty-state">Loading recycling centres…</p>';

  fetch("/api/centres")
    .then(function (response) {
      if (!response.ok) {
        throw new Error("Could not load recycling centres.");
      }
      return response.json();
    })
    .then(function (centres) {
      allCentres = centres;
      renderCentres();
    })
    .catch(function (error) {
      centresList.innerHTML =
        '<p class="empty-state">Recycling centres could not be loaded. Please try again.</p>';

      centresMessage.textContent = "";
      console.error(error);
    });
}

// Escape text before placing it inside HTML
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, function (character) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character];
  });
}

// Filter and display centres
function renderCentres() {
  const search = searchInput.value.trim().toLowerCase();
  const material = materialFilter.value.toLowerCase();

  const filteredCentres = allCentres.filter(function (centre) {
    const searchText = [
      centre.name,
      centre.municipality,
      centre.address
    ].join(" ").toLowerCase();

    const materials = Array.isArray(centre.materials)
      ? centre.materials
      : [];

    const matchesSearch = searchText.includes(search);

    const matchesMaterial = !material ||
      materials.some(function (item) {
        return item.toLowerCase() === material;
      });

    return matchesSearch && matchesMaterial;
  });

  if (filteredCentres.length === 0) {
    centresList.innerHTML =
      '<p class="empty-state">No verified centres match your search yet. Try another area or material.</p>';

    centresMessage.textContent =
      "Only verified centres are displayed. Ask us to add verified local information as it becomes available.";

    return;
  }

  centresList.innerHTML = filteredCentres.map(function (centre) {
    const tags = centre.materials.map(function (item) {
      return '<span class="material-tag">' +
        escapeHTML(item) + '</span>';
    }).join("");

    return `
      <article class="centre-card">
        <h3>${escapeHTML(centre.name)}</h3>
        <p class="centre-area">${escapeHTML(centre.municipality)}</p>
        <p>${escapeHTML(centre.address)}</p>
        <div class="material-tags">${tags}</div>
        <p class="data-note">Verified listing</p>
      </article>
    `;
  }).join("");

  centresMessage.textContent =
    filteredCentres.length + " verified centre(s) found.";
}

// Search updates the results without a page reload
searchButton.addEventListener("click", renderCentres);

searchInput.addEventListener("input", renderCentres);

materialFilter.addEventListener("change", renderCentres);

// Submit a real recycling activity to the database
activityForm.addEventListener("submit", function (event) {
  event.preventDefault();

  activityMessage.textContent = "";
  activityMessage.className = "form-message";

  const formData = new FormData(activityForm);

  const activity = {
    activityType: formData.get("activityType"),
    material: formData.get("material"),
    quantityKg: Number(formData.get("quantityKg")),
    municipality: formData.get("municipality")
  };

  const submitButton = activityForm.querySelector(
    'button[type="submit"]'
  );

  submitButton.disabled = true;
  submitButton.textContent = "Saving…";

  fetch("/api/activities", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(activity)
  })
    .then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) {
          throw new Error(
            data.error || "The activity could not be saved."
          );
        }

        return data;
      });
    })
    .then(function (data) {
      activityMessage.textContent =
        data.message + " Your activity has been recorded.";

      activityMessage.className = "form-message success";

      activityForm.reset();

      loadStats();
    })
    .catch(function (error) {
      activityMessage.textContent = error.message;
      activityMessage.className = "form-message error";

      console.error(error);
    })
    .finally(function () {
      submitButton.disabled = false;
      submitButton.textContent = "Save activity";
    });
});

// Start loading data when the page opens
loadStats();
loadCentres();

const centreForm = document.getElementById("centre-form");
const centreFormMessage = document.getElementById("centre-form-message");

centreForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const formData = new FormData(centreForm);

  const suggestion = {
    name: formData.get("name"),
    municipality: formData.get("municipality"),
    address: formData.get("address"),
    materials: formData.getAll("materials")
  };

  centreFormMessage.textContent = "";
  centreFormMessage.className = "form-message full-width";

  const submitButton = centreForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Submitting…";

  fetch("/api/centres", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(suggestion)
  })
    .then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) {
          throw new Error(data.error || "Submission failed.");
        }
        return data;
      });
    })
    .then(function (data) {
      centreFormMessage.textContent = data.message;
      centreFormMessage.classList.add("success");
      centreForm.reset();
    })
    .catch(function (error) {
      centreFormMessage.textContent = error.message;
      centreFormMessage.classList.add("error");
    })
    .finally(function () {
      submitButton.disabled = false;
      submitButton.textContent = "Submit centre suggestion";
    });
});
