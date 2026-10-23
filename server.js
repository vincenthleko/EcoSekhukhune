
const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to the SQLite database
const db = new Database(
  path.join(__dirname, "database", "ecosekhukhune.db")
);

db.pragma("journal_mode = WAL");

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Create database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS centres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    municipality TEXT NOT NULL,
    address TEXT NOT NULL,
    materials TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_type TEXT NOT NULL,
    material TEXT NOT NULL,
    quantity_kg REAL NOT NULL,
    municipality TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// API health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "success",
    message: "EcoSekhukhune backend is running!"
  });
});

// Get recycling centres
app.get("/api/centres", (req, res) => {
  const centres = db.prepare(`
    SELECT id, name, municipality, address, materials, status
    FROM centres
    WHERE status = 'verified'
    ORDER BY name
  `).all();

  res.json(centres.map(centre => ({
    ...centre,
    materials: JSON.parse(centre.materials)
  })));
});

app.post("/api/centres", (req, res) => {
  const { name, municipality, address, materials } = req.body || {};

  const validMunicipalities = [
    "Fetakgomo Tubatse",
    "Makhuduthamaga",
    "Elias Motsoaledi",
    "Ephraim Mogale"
  ];

  const allowedMaterials = [
    "Plastic",
    "Paper",
    "Glass",
    "Metal",
    "Organic Waste",
    "Electronic Waste"
  ];

  if (
    typeof name !== "string" ||
    name.trim().length < 3 ||
    name.trim().length > 100 ||
    typeof address !== "string" ||
    address.trim().length < 3 ||
    address.trim().length > 200 ||
    !validMunicipalities.includes(municipality) ||
    !Array.isArray(materials) ||
    materials.length < 1 ||
    materials.length > allowedMaterials.length ||
    !materials.every(item => allowedMaterials.includes(item))
  ) {
    return res.status(400).json({
      error: "Please provide valid centre details and at least one material."
    });
  }

  const result = db.prepare(`
    INSERT INTO centres
      (name, municipality, address, materials, status)
    VALUES (?, ?, ?, ?, 'pending')
  `).run(
    name.trim(),
    municipality,
    address.trim(),
    JSON.stringify([...new Set(materials)])
  );

  res.status(201).json({
    message: "Centre suggestion submitted for review.",
    id: result.lastInsertRowid
  });
});


// Submit a recycling activity
app.post("/api/activities", (req, res) => {
  const { activityType, material, quantityKg, municipality } =
    req.body || {};

  const types = ["recycled", "collected"];
  const materials = [
    "Plastic", "Paper", "Glass", "Metal",
    "Organic Waste", "Electronic Waste"
  ];
  const municipalities = [
    "Fetakgomo Tubatse",
    "Makhuduthamaga",
    "Elias Motsoaledi",
    "Ephraim Mogale"
  ];

  if (
    !types.includes(activityType) ||
    !materials.includes(material) ||
    typeof quantityKg !== "number" ||
    !Number.isFinite(quantityKg) ||
    quantityKg <= 0 ||
    quantityKg > 100000 ||
    !municipalities.includes(municipality)
  ) {
    return res.status(400).json({
      error: "Please provide valid recycling activity details."
    });
  }

  const result = db.prepare(`
    INSERT INTO activities
      (activity_type, material, quantity_kg, municipality)
    VALUES (?, ?, ?, ?)
  `).run(activityType, material, quantityKg, municipality);

  res.status(201).json({
    message: "Recycling activity saved successfully!",
    id: result.lastInsertRowid
  });
});

// Get real impact statistics from the database
app.get("/api/stats", (req, res) => {
  const activities = db.prepare(`
    SELECT COUNT(*) AS totalActivities,
           COALESCE(SUM(quantity_kg), 0) AS totalKilograms
    FROM activities
  `).get();

  const centres = db.prepare(`
    SELECT COUNT(*) AS total
    FROM centres
    WHERE status = 'verified'
  `).get();

  res.json({
    recordedActivities: activities.totalActivities,
    recordedKilograms: activities.totalKilograms,
    verifiedCentres: centres.total
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`EcoSekhukhune running at http://localhost:${PORT}`);
});
