import express from "express";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

const app = express();
app.use(express.json());

// 🔌 Koneksi ke database
const db = await mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
});

// ✅ Test endpoint
app.get("/", (req, res) => {
  res.send("API Jalan 🚀");
});

// ✅ Endpoint ambil data users dari DB
app.get("/users", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, name, phone FROM users LIMIT 20"
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Gagal ambil data users",
      error: error.message,
    });
  }
});

app.get("/sisa-pertemuan", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
          s.name AS student_name,
          s.phone AS student_phone,
          cs1.started_at,

          (TO_DAYS(cs1.started_at) - TO_DAYS(NOW())) AS diff_days,

          (
              SELECT COUNT(0)
              FROM course_schedules cs2
              JOIN courses c2 ON c2.id = cs2.course_id
              WHERE c2.student_id = s.id
                AND cs2.status <> 2
                AND cs2.status < 5
                AND cs2.deleted_at IS NULL
          ) AS sisa_pertemuan

      FROM users s

      -- ambil last schedule
      LEFT JOIN (
          SELECT cs.student_id, cs.started_at
          FROM course_schedules cs
          INNER JOIN (
              SELECT student_id, MAX(updated_at) latest_update
              FROM course_schedules
              WHERE status = 2
              GROUP BY student_id
          ) x 
          ON x.student_id = cs.student_id 
          AND x.latest_update = cs.updated_at
      ) cs1 ON cs1.student_id = s.id

      WHERE s.status = 1
      AND EXISTS (
          SELECT 1
          FROM model_has_roles mrs
          WHERE mrs.model_id = s.id
            AND mrs.role_id = 2
      )
    `);

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Gagal ambil data sisa pertemuan",
      error: error.message,
    });
  }
});

// 🚀 Jalankan server
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running di port ${PORT}`);
});