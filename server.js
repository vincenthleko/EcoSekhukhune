
require('dotenv').config();
const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL environment variable.");
  process.exit(1);
}

// Connect to the Render PostgreSQL database.
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

db.on("error", (error) => {
  console.error("Unexpected PostgreSQL connection error:", error.message);
});

// Middleware
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

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

// Create tables in PostgreSQL.
async function initializeDatabase() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS centres (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      municipality TEXT NOT NULL,
      address TEXT NOT NULL,
      materials JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activities (
      id BIGSERIAL PRIMARY KEY,
      activity_type TEXT NOT NULL,
      material TEXT NOT NULL,
      quantity_kg DOUBLE PRECISION NOT NULL,
      municipality TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// API health check
app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1");

    res.json({
      status: "success",
      message: "EcoSekhukhune backend and database are running!"
    });
  } catch (error) {
    console.error("Health check failed:", error.message);
    res.status(503).json({
      status: "error",
      message: "Database is currently unavailable."
    });
  }
});

// Get verified recycling centres
app.get("/api/centres", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, name, municipality, address, materials, status
      FROM centres
      WHERE status = 'verified'
      ORDER BY name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Could not fetch centres:", error.message);
    res.status(500).json({ error: "Could not load recycling centres." });
  }
});

// Suggest a recycling centre
app.post("/api/centres", async (req, res) => {
  const { name, municipality, address, materials } = req.body || {};

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

  try {
    const result = await db.query(
      `INSERT INTO centres
        (name, municipality, address, materials, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id`,
      [
        name.trim(),
        municipality,
        address.trim(),
        JSON.stringify([...new Set(materials)])
      ]
    );

    res.status(201).json({
      message: "Centre suggestion submitted for review.",
      id: result.rows[0].id
    });
  } catch (error) {
    console.error("Could not save centre suggestion:", error.message);
    res.status(500).json({
      error: "Could not save the centre suggestion. Please try again."
    });
  }
});

// Submit a recycling activity
app.post("/api/activities", async (req, res) => {
  const { activityType, material, quantityKg, municipality } =
    req.body || {};

  const validTypes = ["recycled", "collected"];

  if (
    !validTypes.includes(activityType) ||
    !allowedMaterials.includes(material) ||
    typeof quantityKg !== "number" ||
    !Number.isFinite(quantityKg) ||
    quantityKg <= 0 ||
    quantityKg > 100000 ||
    !validMunicipalities.includes(municipality)
  ) {
    return res.status(400).json({
      error: "Please provide valid recycling activity details."
    });
  }

  try {
    const result = await db.query(
      `INSERT INTO activities
        (activity_type, material, quantity_kg, municipality)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [activityType, material, quantityKg, municipality]
    );

    res.status(201).json({
      message: "Recycling activity saved successfully!",
      id: result.rows[0].id
    });
  } catch (error) {
    console.error("Could not save activity:", error.message);
    res.status(500).json({
      error: "Could not save the recycling activity. Please try again."
    });
  }
});

// Get impact statistics
app.get("/api/stats", async (req, res) => {
  try {
    const activities = await db.query(`
      SELECT COUNT(*) AS total_activities,
             COALESCE(SUM(quantity_kg), 0) AS total_kilograms
      FROM activities
    `);

    const centres = await db.query(`
      SELECT COUNT(*) AS total
      FROM centres
      WHERE status = 'verified'
    `);

    res.json({
      recordedActivities: Number(activities.rows[0].total_activities),
      recordedKilograms: Number(activities.rows[0].total_kilograms),
      verifiedCentres: Number(centres.rows[0].total)
    });
  } catch (error) {
    console.error("Could not fetch statistics:", error.message);
    res.status(500).json({
      error: "Could not load impact statistics."
    });
  }
});

// Start only after the database tables are ready.
initializeDatabase()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`EcoSekhukhune running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Database initialization failed:", error.message);
    process.exit(1);
  });
