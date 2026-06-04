import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

console.log("JS LOADED");

const supabaseUrl = "https://llryoespqzykaqawhwob.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxscnlvZXNwcXp5a2FxYXdod29iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0ODg3MTcsImV4cCI6MjA5NjA2NDcxN30.P5tL7TA-VB9EkCSThwE2jIExxya8VYvs2SjU9pCrmQY";

const supabase = createClient(supabaseUrl, supabaseKey);

console.log("SUPABASE INITIALISED");

/* =========================
STATE
========================= */

let currentUser = null;

/* =========================
MODALS
========================= */

const registerModal = document.getElementById("registerModal");
const loginModal = document.getElementById("loginModal");

/* OPEN */
document.getElementById("openRegister").onclick = () => {
  registerModal.style.display = "flex";
};

document.getElementById("loginBtn").onclick = () => {
  loginModal.style.display = "flex";
};

/* CLOSE */
document.getElementById("closeRegister").onclick = () => {
  registerModal.style.display = "none";
};

document.getElementById("closeLogin").onclick = () => {
  loginModal.style.display = "none";
};

/* CLOSE OUTSIDE CLICK */
window.onclick = (e) => {
  if (e.target === registerModal) registerModal.style.display = "none";
  if (e.target === loginModal) loginModal.style.display = "none";
};

/* =========================
REGISTER
========================= */

/* =========================
REGISTER
========================= */

document.getElementById("submitRegister").onclick = async () => {

console.log("REGISTER CLICKED");

const user = {
name: document.getElementById("r_name").value,
surname: document.getElementById("r_surname").value,
national_id: document.getElementById("r_id").value,
email: document.getElementById("r_email").value,
department: document.getElementById("r_department").value
};

console.log("USER:", user);

const { data, error } = await supabase
.from("candidates")
.insert([user])
.select();

console.log("DATA:", data);
console.log("ERROR:", error);

if (error) {
alert("Insert failed");
return;
}

alert("Profile created successfully");

registerModal.style.display = "none";

};

/* =========================
LOGIN
========================= */

document.getElementById("submitLogin").onclick = async () => {
  const type = document.getElementById("loginType").value;

  /* ADMIN LOGIN */
  if (type === "admin") {
    const username = document.getElementById("login_username").value;
    const password = document.getElementById("login_password").value;

    if (username === "admin" && password === "1234") {
      currentUser = { role: "admin" };
      alert("Welcome Admin");
      loginModal.style.display = "none";
    } else {
      alert("Invalid admin login");
    }
  }

  /* CANDIDATE LOGIN */
  if (type === "candidate") {
    const id = document.getElementById("login_id").value;

    const { data, error } = await supabase
      .from("candidates")
      .select("*")
      .eq("national_id", id)
      .single();

    if (error || !data) {
      console.log(error);
      alert("No profile found. Please register first.");
      return;
    }

    currentUser = data;

    /* UI UPDATE */
    document.querySelector(".welcome h1").innerText =
      "Welcome " + data.name + " " + data.surname;

    document.querySelector(".welcome p").innerText =
      "Department: " + data.department;

    alert("Welcome " + data.name);

    loginModal.style.display = "none";
  }
};