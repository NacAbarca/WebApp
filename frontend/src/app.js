// frontend/src/app.js
// import { cache } from "react";
import { api } from "./services/api.js";

const { createApp, ref, computed, onMounted, watch } = Vue;

createApp({
  setup() {
    // -------- Auth
    const email = ref("");
    const password = ref("");
    const user = ref(null);
    // ---- Views (submenu)
    const view = ref("appointments"); // appointments | history | users | settings | audit
    
    const isAdmin = computed(() => user.value?.role === "admin");
    const canAudit = computed(() => isAdmin.value);
    function go(v) { view.value = v; }

    const loading = ref(false);
    const errorMsg = ref("");

    const canCreateAppointment = computed(() => createDisabledReason.value === "");

    let userModal = null;        // modal usuarios (admin)
    let appointmentModal = null; // modal citas

    function parseDMYHi(s) {
      const raw = String(s || "").trim();

      // Acepta:
      // 12-12-2025 12:00
      // 12/12/2025 12:00
      // 12-12-2025 12:00:00
      // 2025-12-12T12:00  (datetime-local)
      let m = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
      if (m) {
        const dd = Number(m[1]), mm = Number(m[2]), yyyy = Number(m[3]);
        const HH = Number(m[4]), ii = Number(m[5]), ss = Number(m[6] || 0);

        const d = new Date(yyyy, mm - 1, dd, HH, ii, ss, 0);
        if (
          d.getFullYear() !== yyyy ||
          d.getMonth() !== (mm - 1) ||
          d.getDate() !== dd ||
          d.getHours() !== HH ||
          d.getMinutes() !== ii
        ) return null;

        return d;
      }

      // Soporta datetime-local nativo: 2025-12-12T12:00(:00)
      m = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
      if (m) {
        const yyyy = Number(m[1]), mm = Number(m[2]), dd = Number(m[3]);
        const HH = Number(m[4]), ii = Number(m[5]), ss = Number(m[6] || 0);

        const d = new Date(yyyy, mm - 1, dd, HH, ii, ss, 0);
        if (
          d.getFullYear() !== yyyy ||
          d.getMonth() !== (mm - 1) ||
          d.getDate() !== dd ||
          d.getHours() !== HH ||
          d.getMinutes() !== ii
        ) return null;

        return d;
      }

      return null;
    }

    function dbToUi(dbStr) {
      // "2026-12-29 10:00:00" -> "29-12-2026 10:00"
      if (!dbStr) return "";
      const m = String(dbStr).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?$/);
      if (!m) return dbStr;
      const [, y, mo, d, h, mi] = m;
      return `${d}-${mo}-${y} ${h}:${mi}`;
    }

    function uiToDb(uiStr) {
      const d = parseDMYHi(uiStr);
      if (!d) return "";
      const pad = (n) => String(n).padStart(2, "0");
      const yyyy = d.getFullYear();
      const mm = pad(d.getMonth() + 1);
      const dd = pad(d.getDate());
      const HH = pad(d.getHours());
      const ii = pad(d.getMinutes());
      const ss = pad(d.getSeconds());
      return `${yyyy}-${mm}-${dd} ${HH}:${ii}:${ss}`;
    }

    async function loadMe() {
      try {
        const data = await api({ path: "auth", action: "me" });
        user.value = data.user || null;

        if (user.value && ["admin", "staff"].includes(user.value.role)) {
          await loadPatients();
        }

      } catch (e) {
        user.value = null;
      }
    }


    async function login() {
      errorMsg.value = "";
      loading.value = true;
      try {
        const data = await api(
          { path: "auth", action: "login" },
          { method: "POST", body: { email: email.value, password: password.value } }
        );
        user.value = data.user;
        view.value = "appointments";
        await loadUsersSafe();
        await loadAppointmentsSafe();
      } catch (e) {
        errorMsg.value = e.message || "Error login";
      } finally {
        loading.value = false;
      }
    }

    async function logout() {
      errorMsg.value = "";
      try {
        await api({ path: "auth", action: "logout" }, { method: "POST", body: {} });
      } catch (e) {}
      user.value = null;
      view.value = "appointments";
      users.value = [];
      appointments.value = [];
    }

    // -------- Users
    const users = ref([]);
    const form = ref({
      id: null,
      name: "",
      email: "",
      role: "seleccionar",
      status: "active",
      password: "",
    });
    
    const canManageUsers = computed(() => user.value?.role === "admin");
// -------- Appointments
      const appointments = ref([]);
      const apptError = ref("");
      const apptForm = ref({
        user_id: "",
        id_paciente: "",
        start_at: "",
        end_at: "",
        notes: "",
      });

    async function loadUsersSafe() {
      // Staff/User: backend debería devolver 403 → no lo tratamos como bug
      try {
        const data = await api({ path: "users" });
        users.value = data.users || [];
      } catch (e) {
        // si no tiene permiso, dejamos users vacío
        users.value = [];
      }
    }
    async function loadAppointmentsSafe() {
      apptError.value = "";
      try {
        const data = await api({
          path: "appointments",
          from: "2026-01-01",
          to: "2026-12-31",
        });
        appointments.value = data.appointments || [];
      } catch (e) {
        appointments.value = [];
        apptError.value = e.message;
      }
    }
    function openCreate() {
      if (!canManageUsers.value) return;
      form.value = { id: null, name: p.x ?? "", email: p.x ?? "", role: "user", status: "active", password: "" };
      userModal?.show();
    }
    function openEdit(u) {
      if (!canManageUsers.value) return;
      form.value = { id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, password: "" };
      userModal?.show();
    }
    async function saveUser() {
      if (!canManageUsers.value) return;
      errorMsg.value = "";
      try {
        if (!form.value.name) throw new Error("Nombre requerido");
        if (!form.value.id && !form.value.email) throw new Error("Email requerido");

        if (!form.value.id) {
          await api({ path: "users" }, { method: "POST", body: form.value });
        } else {
          await api({ path: "users", id: String(form.value.id) }, { method: "PUT", body: form.value });
        }

        userModal?.hide();
        await loadUsersSafe();
      } catch (e) {
        errorMsg.value = e.message;
      }
    }    
    async function deactivate(u) {
    if (!canManageUsers.value) return;
    if (!confirm(`Desactivar usuario ${u.email}?`)) return;

    try {
        await api(
        { path: "users", id: String(u.id) },
        { method: "PUT", body: { status: "inactive" } }
        );
        await loadUsersSafe();
    } catch (e) {
        errorMsg.value = e.message;
    }
    }
    async function deleteUser(u) {
      if (!canManageUsers.value) return;

      
      const ok = confirm(`Eliminar (soft) a ${u.email}? Quedará INACTIVO.`);
      if (!ok) return;

      try {
        await api({ path: "users", id: String(u.id) }, { method: "DELETE" });
        await loadUsersSafe();
      } catch (e) {
        errorMsg.value = e.message;
      }
    }

    async function createAppointment() {
      apptError.value = "";

      if (!canCreateAppointment.value) return;

      // formato UI requerido: d-m-Y H:i
      const startDb = uiToDb(apptForm.value.start_at);
      const endDb = uiToDb(apptForm.value.end_at);

      if (!startDb || !endDb) {
        apptError.value = "Formato inválido. Usa d-m-Y H:i (ej: 29-12-2026 10:00)";
        return;
      }

      // Regla: start < end
      if (startDb >= endDb) {
        apptError.value = "Start debe ser ANTES que End (no puede ser igual ni después).";
        return;
      }
      

      try {
        await api(
          { path: "appointments" },
          {
            method: "POST",
            body: {
              user_id: Number(apptForm.value.user_id),
              id_paciente: apptForm.value.id_paciente ? String(apptForm.value.id_paciente) : null,
              start_at: startDb,
              end_at: endDb,
              notes: apptForm.value.notes,
            },
          }
        );
        apptForm.value.notes = "";
        await loadAppointmentsSafe();
      } catch (e) {
        apptError.value = e.message;
      }
    }
    async function setAppointmentStatus(a, status) {
      apptError.value = "";
      try {
        await api(
          { path: "appointments", id: String(a.id) },
          { method: "PUT", body: { status } }
        );
        await loadAppointmentsSafe();
      } catch (e) {
        apptError.value = e.message;
      }
    }
    async function cancelAppointment(a) {
      apptError.value = "";
      try {
        await api({ path: "appointments", id: String(a.id) }, { method: "DELETE" });
        await loadAppointmentsSafe();
      } catch (e) {
        apptError.value = e.message;
      }
    }
    // dropdown: lista disponible
    const selectableUsers = computed(() => {
      // admin ve a todos (si cargó users), si no, al menos a sí mismo
      if (user.value?.role === "admin" && users.value.length) return users.value;

      // staff/user: solo a sí mismo
      if (user.value) {
        return [{
          id: user.value.id,
          name: user.value.name || "Mi usuario",
          email: user.value.email,
        }];
      }
      return [];
    });
    // Valor por defecto del selector
    watch(
      () => user.value,
      () => {
        if (user.value) apptForm.value.user_id = String(user.value.id);
      }
    );
    const createDisabledReason = computed(() => {
      const s = parseDMYHi(apptForm.value.start_at);
      const e = parseDMYHi(apptForm.value.end_at);

      if (!s || !e) return "Formato inválido. Usa d-m-Y H:i (ej: 29-12-2026 10:00)";
      if (s.getTime() >= e.getTime()) return "Start debe ser ANTES de End";

      if (!apptForm.value.user_id) return "Falta usuario";
      return "";
    });

    // =====================
    // ====== Pacientes =====
    // =====================

    const patients = ref([]);
    const patientsError = ref("");
    const editingPatientId = ref(null);

    // Base del formulario alineado con tu tabla MySQL (pacientes)
    const patientFormBase = () => ({
    id_paciente: "",               // PK VARCHAR(12)  (tu "RUN/RUT" con guion)
    created_at: "",
    updated_at: "",

    usuario: "",
    nombres: "",
    apellido_paterno: "",
    apellido_materno: "",

    fecha_nacimiento: "",          // YYYY-MM-DD
    edad: 0,

    porcentaje_discapacidad: 0,
    condiciones: "",
    nacionalidad: "",
    genero: "",

    establecimiento: "",
    ampersand_flag: 0,

    contacto: "",
    email: "",

    direccion: "",
    comuna: "",
    region: "",
    provincia: "",

    vigente: 1,                    // TINYINT(1)
    sector: "Sin informado",       // ENUM con default "Sin informado"

    foto: "",
    observaciones: "",
    });

    const patientForm = ref(patientFormBase());

    // Bootstrap modal instance
    let patientModal = null;

    // Llama esto en mounted (o cuando ya exista el DOM)
    function initPatientModal() {
    const el = document.getElementById("patientModal");
    if (el && window.bootstrap) patientModal = new bootstrap.Modal(el);
    }

    // Limpia el form (y modo editar)
    function resetPatientForm() {
    editingPatientId.value = null;
    patientForm.value = patientFormBase();
    }

    // Abrir modal “Nuevo”
    function openCreatePatient() {
    if (!["admin", "staff"].includes(user.value?.role)) return;
    resetPatientForm();
    patientModal?.show();
    }

    // Abrir modal “Editar”
    function openEditPatient(p) {
    if (!["admin", "staff"].includes(user.value?.role)) return;
    if (!p) return;

    editingPatientId.value = p.id_paciente;

    patientForm.value = {
        ...patientFormBase(),

        id_paciente: String(p.id_paciente ?? ""),
        created_at: String(p.created_at ?? ""),
        updated_at: String(p.updated_at ?? ""),

        usuario: String(p.usuario ?? ""),
        nombres: String(p.nombres ?? ""),
        apellido_paterno: String(p.apellido_paterno ?? ""),
        apellido_materno: String(p.apellido_materno ?? ""),

        fecha_nacimiento: String(p.fecha_nacimiento ?? ""),
        edad: Number(p.edad ?? 0),

        porcentaje_discapacidad: Number(p.porcentaje_discapacidad ?? 0),
        condiciones: String(p.condiciones ?? ""),
        nacionalidad: String(p.nacionalidad ?? ""),
        genero: String(p.genero ?? ""),

        establecimiento: String(p.establecimiento ?? ""),
        ampersand_flag: Number(p.ampersand_flag ?? 0),

        contacto: String(p.contacto ?? ""),
        email: String(p.email ?? ""),

        direccion: String(p.direccion ?? ""),
        comuna: String(p.comuna ?? ""),
        region: String(p.region ?? ""),
        provincia: String(p.provincia ?? ""),

        vigente: Number(p.vigente ?? 1),
        sector: String(p.sector ?? "Sin informado"),

        foto: String(p.foto ?? ""),
        observaciones: String(p.observaciones ?? ""),
    };

    patientModal?.show();
    }

    // GET lista
    async function loadPatients() {
    patientsError.value = "";
    try {
        const data = await api({ path: "patients" }); // <- correcto
        patients.value = Array.isArray(data.patients) ? data.patients : [];
    } catch (e) {
        patientsError.value = e.message || "Error cargando pacientes";
        patients.value = [];
    }
    }

    // Normaliza payload para backend
    function buildPatientPayload() {
        const f = patientForm.value;
        return {
            id_paciente: String(f.id_paciente || "").trim(),
            usuario: String(f.usuario || "").trim(),
            nombres: String(f.nombres || "").trim(),
            apellido_paterno: String(f.apellido_paterno || "").trim(),
            apellido_materno: String(f.apellido_materno || "").trim(),

            fecha_nacimiento: f.fecha_nacimiento || null,
            edad: Number(f.edad ?? 0),

            porcentaje_discapacidad: Number(f.porcentaje_discapacidad ?? 0),
            condiciones: String(f.condiciones || "").trim() || null,
            nacionalidad: String(f.nacionalidad || "").trim() || null,
            genero: String(f.genero || "").trim() || null,

            establecimiento: String(f.establecimiento || "").trim() || null,
            ampersand_flag: Number(f.ampersand_flag ?? 0),

            contacto: String(f.contacto || "").trim() || null,
            email: String(f.email || "").trim() || null,

            direccion: String(f.direccion || "").trim() || null,
            comuna: String(f.comuna || "").trim() || null,
            region: String(f.region || "").trim() || null,
            provincia: String(f.provincia || "").trim() || null,

            sector: String(f.sector || "Sin informado").trim(),
            vigente: Number(f.vigente ?? 1),

            foto: String(f.foto || "").trim() || null,
            observaciones: String(f.observaciones || "").trim() || null,
        };
    }

    // POST/PUT guardar
    async function savePatient() {
    patientsError.value = "";

    const payload = buildPatientPayload();

    if (!payload.id_paciente) {
        patientsError.value = "Falta id_paciente (RUN/RUT).";
        return;
    }
    if (!payload.nombres) {
        patientsError.value = "Falta nombres.";
        return;
    }

    try {
        if (editingPatientId.value) {
        // PUT
        await api(
            { path: "patients", id_paciente: editingPatientId.value },
            { method: "PUT", body: payload }
        );
        } else {
        // POST
        await api(
            { path: "patients" },
            { method: "POST", body: payload }
        );
        }

        await loadPatients();
        patientModal?.hide();
        resetPatientForm();
    } catch (e) {
        patientsError.value = e.message || "Error guardando paciente";
    }
    }



    // -------- Tooltips Bootstrap
    function initTooltips() {
      // Limpia y vuelve a crear tooltips
      document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
        if (el._tooltip) el._tooltip.dispose?.();
        el._tooltip = new bootstrap.Tooltip(el);
      });
    }

    function initModal(id) {
      const el = document.getElementById(id);
      if (!el) return null;

      const m = new bootstrap.Modal(el);

      // Fix accesibilidad: evita warning aria-hidden/focus
      el.addEventListener("hidden.bs.modal", () => {
        if (document.activeElement) document.activeElement.blur();
      });

      return m;
    }

    function openCreateAppointmentModal() {
      if (!user.value) return;
      appointmentModal?.show();
    }

    onMounted(async () => {
      await loadMe();

      userModal = initModal("userModalUsers");
      patientModal = initModal("patientModal");
      appointmentModal = initModal("appointmentModal");

      if (user.value) {

          await loadAppointmentsSafe();

        if (["admin", "staff"].includes(user.value.role)) {

            await loadUsersSafe();
            await loadPatients();
        }
      }

      initTooltips();
    });


    // Re-init tooltips cuando cambie el mensaje
    watch(createDisabledReason, () => initTooltips());

    return {
      // --- navegación / auth (lo tuyo ya está)
      view,
      login,
      loadMe,
      logout,
      canAudit,
      dbToUi,
      go,
      isAdmin,
      email,
      password,
      user,
      loading,
      errorMsg,

      // --- users (lo tuyo ya está)
      users,
      form,
      deleteUser,
      deactivate,
      saveUser,
      openEdit,
      openCreate,
      canManageUsers,

      // ✅ PACIENTES (ESTO FALTABA)
      patients,
      patientsError,
      loadPatients,
      editingPatientId,
      patientForm,
      openCreatePatient,
      openEditPatient,
      resetPatientForm,
      savePatient,
      initPatientModal,

      // --- citas (si tu template las usa)
      appointments,
      apptError,

      apptForm,
      loadAppointmentsSafe,
      createAppointment,
      setAppointmentStatus,
      openCreateAppointmentModal,
      cancelAppointment,
      canCreateAppointment,

    };

  },

  template: `
  <!------------------------------>
  <!-- start: Login form -->
  <!------------------------------>
<!-- ========================= -->
<!-- LOGIN -->
<!-- ========================= -->
<div class="container-fluid" v-if="!user">
    <main class="w-100 m-auto" style="max-width: 330px; padding: 1rem;">
        <form>
            <img class="mb-4" src="https://getbootstrap.com//docs/5.3/assets/brand/bootstrap-logo.svg" alt="" width="72" height="57">
            <h1 class="h3 mb-3 fw-normal">Iniciar sesión</h1>
    
            <div v-if="errorMsg" class="alert alert-danger">{{ errorMsg }}</div>

            <div class="form-floating"> 
                <input type="email" class="form-control" id="floatingInput" placeholder="Se ingresa con su correo" v-model="email" autocomplete="username">
                <label for="floatingInput">Correo</label>
            </div>

            <div class="form-floating"> 
                <input type="password" class="form-control" id="floatingPassword" placeholder="Se ingresa con su contraseña" v-model="password" autocomplete="current-password">
                <label for="floatingPassword">Contraseña</label>
            </div>
            <!-- Botón para iniciar sesión -->
            <!-- Deshabilitado mientras se procesa la autenticación -->
            <!-- Muestra estado: "Ingresando..." o "Iniciar sesión" -->
            <button class="btn btn-primary w-100 py-2" :disabled="loading" @click="login">
                {{ loading ? "Ingresando..." : "Iniciar sesión" }}
            </button>
            <p class="mt-5 mb-3 text-body-secondary">© 2025–2026</p>
        </form>
    </main>
</div>
  <!------------------------------>
  <!--- end: Login form --->
  <!------------------------------>
<div v-else>
      <!--- Body content --->
    <div class="container-fluid">
        <div class="row">
            <div class="col col-12">

                <!---Header--->
                <header class="p-3 mb-3 border-bottom">
                    <div class="container-fluid">
                        <div class="d-flex flex-wrap align-items-center justify-content-center justify-content-lg-start">

                        <a href="/" class="d-flex align-items-center mb-2 mb-lg-0 link-body-emphasis text-decoration-none"> 
                            <svg class="bi me-2" width="40" height="32" role="img" aria-label="Bootstrap">
                                <use xlink:href="#bootstrap"></use>
                            </svg>
                        </a>

                        <ul class="nav col-12 col-lg-auto me-lg-auto mb-2 justify-content-center mb-md-0">

                            <li><a href="#" class="nav-link active px-2 link-secondary" :class="{ active: view==='appointments' }" @click="go('appointments')">📅 Citas</a></li>
                            <li><a href="#" class="nav-link px-2 link-body-emphasis" :class="{ active: view==='patients' }" @click="go('patients')">👥 Pacientes</a></li>
                            <div v-if="isAdmin"> <li><a href="#" class="nav-link px-2 link-body-emphasis" :class="{ active: view==='history' }" @click="go('history')">🕘 Historial</a></li> </div>
                            <div v-if="isAdmin"> <li><a href="#" class="nav-link px-2 link-body-emphasis" :class="{ active: view==='users' }" @click="go('users')">👥 Equipos</a></li> </div>
                            <div v-if="isAdmin"> <li><a href="#" class="nav-link px-2 link-body-emphasis" :class="{ active: view==='settings' }" @click="go('settings')">⚙️ Ajustes</a></li> </div>
                            <div v-if="isAdmin"> <li><a href="#" class="nav-link px-2 link-body-emphasis" :class="{ active: view==='audit' }" @click="go('audit')">🧾 Auditoría</a></li> </div>

                        </ul>

                        <form class="col-12 col-lg-auto mb-3 mb-lg-0 me-lg-3" role="search">
                            <input type="search" id="search" class="form-control" placeholder="Search..." aria-label="Search">
                        </form>

                        <div class="dropdown text-end">
                                        
                            <a href="#" class="d-block link-body-emphasis text-decoration-none dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                            <img src="https://github.com/mdo.png" alt="mdo" width="32" height="32" class="rounded-circle">
                            </a>

                            <ul class="dropdown-menu text-small">
                            <li><a class="dropdown-item" href="#">New project...</a></li>
                            <li><a class="dropdown-item" href="#">Settings</a></li>
                            <li><a class="dropdown-item" href="#">Profile</a></li>
                            <li><hr class="dropdown-divider"></li>
                            <li><a class="dropdown-item link-danger link-offset-2 link-underline-opacity-25 link-underline-opacity-100-hover" href="#" @click="logout">Cerrar sesión</a></li>
                            </ul>
                        </div>
                        </div>
                    </div>
                </header>
                <!---End Header--->
                <div class="row">

                    <!-- Sidebar -->
                    <!-- Sidebar principal -->
                    <!-- Contiene botones de acceso rápido para crear nuevos registros -->
                    <div class="col col-2">
                            
                        SideBar (Pendiente)                
                        <!-- ================================ -->
                        <!-- BOTONES DE CREACIÓN RÁPIDA -->
                        <!-- ================================ -->
                        <div class="d-grid gap-2">

                            <!-- Botón para crear nuevo usuario -->
                            <!-- Solo disponible para administradores -->
                            <button class="btn btn-sm btn-success" :disabled="!canManageUsers" @click="openCreate">
                            + Nuevo usuario
                            </button>

                            <!-- Botón para crear nuevo paciente -->
                            <!-- Abre modal de registro de pacientes -->
                            <button type="button" class="btn btn-sm btn-primary" @click="openCreatePatient">
                            + Nuevo paciente
                            </button>

                            <!-- Botón para crear nueva cita -->
                            <!-- Abre modal de creación de citas -->
                            <button type="button" class="btn btn-sm btn-success" @click="openCreateAppointmentModal">
                            + Nueva cita
                            </button>

                        </div>
                        <!-- FIN: Botones de creación rápida -->

                    </div>

                    <!-- end: SideBar -->

                    <!-- Main content -->
                    <div class="col col-10">

                        <div class="d-flex justify-content-between align-items-center mb-4">
                            <div>
                                <h1 class="h3 mb-1">WebApp Citas</h1>
                                <div class="text-muted">Admin panel (login + usuarios)</div>
                            </div>
                            <button v-if="user" class="btn btn-outline-danger" @click="logout">Cerrar sesión</button>
                        </div>

                        <!-- ================================ -->
                        <!-- TABLA DE USUARIOS (ADMIN ONLY) -->
                        <!-- ================================ -->
                        <div v-if="view==='users' && isAdmin">
                            <!-- Alerta de sesión activa -->
                            <div class="alert alert-success d-flex justify-content-between align-items-center">
                                <div>✅ Sesión activa — <b>{{ user.email }}</b> ({{ user.role }})</div>

                                <!-- Botón para crear nuevo usuario con tooltip -->
                                <!-- wrapper para tooltip aunque esté disabled -->
                                <span
                                    class="d-inline-block"
                                    tabindex="0"
                                    data-bs-toggle="tooltip"
                                    :data-bs-title="canManageUsers ? 'Crear usuario' : 'Solo admin puede gestionar usuarios'"
                                    >
                                    <button
                                        class="btn btn-sm btn-success"
                                        :disabled="!canManageUsers"
                                        @click="openCreate"
                                        >
                                    + Nuevo usuario
                                </button>
                                </span>
                            </div>
                            <!-- Tarjeta principal de usuarios -->
                            <div class="card shadow-sm mb-4">

                                <!-- Encabezado de la tarjeta -->
                                <div class="card-header d-flex justify-content-between align-items-center">
                                    <div class="fw-semibold">Usuarios</div>
                                </div>

                                <!-- Tabla responsiva con listado de usuarios -->
                                <div class="table-responsive">

                                    <table class="table table-striped mb-0 table-hover">
                                        <thead>
                                            <tr>
                                                <th>ID</th>
                                                <th>Nombre</th>
                                                <th>Email</th>
                                                <th>Rol</th>
                                                <th>Status</th>
                                                <th>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="u in users" :key="u.id">
                                                <td>{{ u.id }}</td>
                                                <td>{{ u.name }}</td>
                                                <td>{{ u.email }}</td>
                                                <td><span class="badge text-bg-secondary">{{ u.role }}</span></td>
                                                <td>
                                                <span class="badge" :class="u.status==='active' ? 'text-bg-success' : 'text-bg-warning'">
                                                    {{ u.status }}
                                                </span>
                                                </td>

                                                <td class="d-flex gap-2">
                                                <!-- Botón para editar usuario -->
                                                <button class="btn btn-sm btn-outline-primary" :disabled="!canManageUsers" @click="openEdit(u)">
                                                    Editar
                                                </button>

                                                <!-- Botón para desactivar usuario -->
                                                <button class="btn btn-sm btn-outline-warning" :disabled="!canManageUsers" @click="deactivate(u)">
                                                    Desactivar
                                                </button>

                                                <!-- Botón para eliminar usuario (soft delete) -->
                                                <!-- Tooltip indicando si está autorizado -->
                                                <span 
                                                    class="d-inline-block"
                                                    tabindex="0"
                                                    data-bs-toggle="tooltip"
                                                    :data-bs-title="canManageUsers ? 'Eliminar (soft)' : 'No autorizado por rol'"
                                                    >
                                                    <button class="btn btn-sm btn-outline-danger" :disabled="!canManageUsers" @click="deleteUser(u)">
                                                    Eliminar
                                                    </button>
                                                </span>
                                                </td>
                                            </tr>
                                            <tr v-if="users.length===0">
                                                <td colspan="6" class="text-muted p-4">Sin usuarios</td>
                                            </tr>
                                        </tbody>
                                    </table>

                                </div>

                                <div class="card-footer">
                                    <!-- Botón para refrescar tabla de usuarios -->
                                    <button class="btn btn-sm btn-outline-secondary" @click="loadUsersSafe">Refrescar</button>
                                </div>

                            </div>
                            <!-- FIN: Tabla de usuarios -->
                        </div>
                        
                        <div v-if="view==='appointments'">

                        <!-- Alerta de errores en citas -->
                        <div v-if="apptError" class="alert alert-danger">{{ apptError }}</div>

                        <!-- Tarjeta principal de gestión de citas -->
                        <div class="card shadow-sm mb-4">
                            <div class="card-header">

                                <div class="d-flex justify-content-between align-items-center">
                                    <h5 class="h5 mb-0">Gestión de citas</h5>
                                    <!-- Botón para refrescar tabla de citas -->
                                    <button class="btn btn-sm btn-outline-secondary" @click="loadAppointments">Refrescar</button>
                                </div>

                             </div>
                                <!-- ================================ -->
                                <!-- FORMULARIO DE CREACIÓN DE CITAS -->
                                <!-- ================================ -->
                            <div class="card-body">

                            <div class="row g-2 align-items-end">
                                <!-- Campo: Seleccionar Usuario -->
                                <div class="col-md-3">
                                
                                <label class="form-label">Usuario</label>
                                    
                                    <select class="form-select" v-model="apptForm.user_id">
                                    <option value="">Selecciona usuario</option>
                                    <option v-for="u in selectableUsers" :key="u.id" :value="String(u.id)">
                                        {{ u.name }} ({{ u.email }})
                                    </option>
                                    </select>

                                </div>

                                <!-- Campo: Fecha y hora de inicio -->
                                <div class="col-md-3">
                                    <label class="form-label">Inicio (DD-MM-YYYY HH:MM)</label>
                                    <input type="text" class="form-control" v-model="apptForm.start_at" placeholder="15-01-2026 10:00" />
                                </div>

                                <!-- Campo: Fecha y hora de término -->
                                <div class="col-md-3">
                                    <label class="form-label">Termino (DD-MM-YYYY HH:MM)</label>
                                    <input type="text" class="form-control" v-model="apptForm.end_at" placeholder="11-01-2026 10:30" />
                                </div>

                                <!-- Campo: Notas/Observaciones -->
                                <div class="col-md-2">
                                    <label class="form-label">Notas</label>
                                    <input class="form-control" v-model="apptForm.notes" placeholder="Motivo..." />
                                </div>

                                <!-- Botón para crear cita -->
                                <!-- Tooltip con razón de deshabilitación si aplica -->
                                <div class="col-md-1 d-grid">
                                <span
                                class="d-inline-block"
                                tabindex="0"
                                data-bs-toggle="tooltip"
                                :data-bs-title="createDisabledReason || 'Crear cita'"
                                >
                                    <button class="btn btn-success w-100" :disabled="!canCreateAppointment" @click="createAppointment">
                                        Crear
                                    </button>
                                </span>
                                </div>
                            </div>

                            <hr>

                            <!-- ================================ -->
                            <!-- TABLA DE CITAS REGISTRADAS -->
                            <!-- ================================ -->
                            <table class="table table-hover table-responsive">
                                <thead>
                                <tr>
                                    <th scope="col"> ID</th>
                                    <th scope="col"> Usuario</th>
                                    <th scope="col"> Start</th>
                                    <th scope="col"> End</th>
                                    <th scope="col"> Status</th>
                                    <th scope="col"> Acciones</th>
                                </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="a in appointments" :key="a.id">
                                    <td>{{ a.id }}</td>
                                    <td>
                                        <div class="fw-semibold">{{ a.user_name }}</div>
                                        <div class="text-muted small">{{ a.user_email }}</div>
                                    </td>
                                    <td>{{ dbToUi(a.start_at) }}</td>
                                    <td>{{ dbToUi(a.end_at) }}</td>
                                    <td><span class="badge text-bg-info">{{ a.status }}</span></td>
                                    <!-- ================================ -->
                                    <!-- BOTONES DE ACCIONES DE CITA -->
                                    <!-- ================================ -->
                                    <td class="d-flex flex-wrap gap-2">
                                        <!-- Botón para confirmar cita -->
                                        <button class="btn btn-sm btn-outline-primary" @click="setAppointmentStatus(a,'confirmed')">Confirmar</button>
                                        <!-- Botón para marcar como completada -->
                                        <button class="btn btn-sm btn-outline-success" @click="setAppointmentStatus(a,'done')">Done</button>
                                        <!-- Botón para marcar como no asistió -->
                                        <button class="btn btn-sm btn-outline-warning" @click="setAppointmentStatus(a,'no_show')">No-show</button>
                                        <!-- Botón para cancelar cita -->
                                        <button class="btn btn-sm btn-outline-danger" @click="cancelAppointment(a)">Cancelar</button>
                                    </td>
                                    </tr>
                                    <tr v-if="appointments.length===0">
                                        <td colspan="6" class="text-muted p-4">Sin citas</td>
                                    </tr>
                                </tbody>
                            </table>

                            </div>
                            <div class="card-footer">
                                <div>✅ Sesión activa — <b>{{ user.email }}</b> ({{ user.role }})</div>
                            </div>  
                        </div>

                        <!---- Citas: tabla ---->
                        </div>

                        <!-- ================================ -->
                        <!-- TABLA DE PACIENTES -->
                        <!-- ================================ -->
                        <div v-if="view==='patients'" class="card shadow-sm mb-4">

                            <div class="card-header">
                                <div class="d-flex justify-content-between align-items-center">
                                    <h2 class="h5 mb-2">Gestión de pacientes</h2>
                                    <!-- Botón para crear nuevo paciente -->
                                    <button class="btn btn-sm btn-success" :disabled="!canManageUsers" @click="openCreatePatient">
                                        + Nuevo paciente
                                    </button>
                                </div>
                            </div>
                            
                            <div class="card-body">

                                <!-- Tabla responsiva de pacientes -->
                                <div class="table-responsive">
                                    <table class="table table-hover">
                                        <thead>
                                            <tr>
                                                <th scope="col">Rut</th>
                                                <th scope="col">Usuario</th>
                                                <th scope="col">Sector</th>
                                                <th scope="col">Vigencia</th>
                                                <th scope="col">Sector</th>
                                                <th scope="col">xxx</th>
                                                <th scope="col">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="(p, idx) in patients" :key="p.id_paciente || idx">
                                              <td>{{ p.id_paciente }}</td>
                                              <td><strong>{{ p.nombres }} {{ p.apellido_paterno }} {{ p.apellido_materno }}</strong></td>
                                              <td><span class="badge text-bg-success">{{ p.sector }}</span></td>
                                              <td>{{ p.contacto }}</td>
                                              <td><button class="btn btn-sm btn-outline-primary" @click="openEditPatient(p)">Editar</button></td>
                                            </tr>
                                            <tr v-if="patients.length === 0">
                                                <td colspan="5" class="text-muted p-4 text-center">Sin pacientes registrados</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div class="card-footer">
                                <!-- Botón para refrescar tabla de pacientes -->
                                <button class="btn btn-sm btn-outline-secondary" @click="loadAppointments">Refrescar+++</button>
                            </div>
                        <!-- FIN: Tabla de pacientes -->
                        </div>              

                        <!-- ================================ -->
                        <!-- SECCIÓN DE HISTORIAL -->
                        <!-- ================================ -->
                        <div v-if="view==='history'" class="card shadow-sm mb-4">

                            <div class="card-header">

                                <div class="d-flex justify-content-between align-items-center">
                                <h2 class="h5 mb-2">Historial</h2>
                                <!-- Botón para refrescar historial -->
                                <button class="btn btn-sm btn-outline-secondary" @click="loadAppointments">Refrescar</button>
                                </div>

                            </div>

                            <div class="card-body">
                                <div class="text-muted">Próximo sprint: tabla con cambios de estado por cita.</div>
                            </div>

                            <div class="card-footer">
                                footer
                            </div>  

                        </div>
                        <!-- FIN: Sección de historial -->

                        <!-- ================================ -->
                        <!-- SECCIÓN DE AJUSTES -->
                        <!-- ================================ -->
                        <div v-if="view==='settings'" class="card shadow-sm mb-4">
                            <div class="card-header">

                                <div class="d-flex justify-content-between align-items-center">
                                    <h2 class="h5 mb-2">Ajustes</h2>
                                    <!-- Botón para refrescar ajustes -->
                                    <button class="btn btn-sm btn-outline-secondary" @click="loadAppointments">Refrescar</button>
                                </div>
                            
                            </div>
                            <div class="card-body">
                                <div class="text-muted">Próximo sprint: preferencias de fechas, filtros, etc.</div>
                            </div>
                            <div class="card-footer">
                                footer
                            </div>  
                        </div>
                        <!-- FIN: Sección de ajustes -->
                        
                        <!-- ================================ -->
                        <!-- SECCIÓN DE AUDITORÍA -->
                        <!-- ================================ -->
                        <div v-if="view==='audit' && canAudit" class="card shadow-sm mb-4">
                            <div class="card-header"> 

                                <div class="d-flex justify-content-between align-items-center">
                                    <h2 class="h5 mb-2">Auditoría</h2>
                                    <!-- Botón para refrescar auditoría -->
                                    <button class="btn btn-sm btn-outline-secondary" @click="loadAppointments">Refrescar</button>
                                </div>
                            </div>
                            <div class="card-body">
                                <div class="text-muted">Próximo sprint: eventos (login, cambios usuarios, cambios citas).</div>
                            </div>
                            <div class="card-footer">footer</div>  
                        </div>

                        <!---- Create Paciente – Modal ---->

                        <!-- ================================ -->
                        <!-- MODAL DE PACIENTE (CREATE/EDIT) -->
                        <!-- ================================ -->

                        <div class="modal fade" id="patientModal" tabindex="-1" aria-hidden="true">
                            <div class="modal-dialog modal-lg modal-dialog-centered">
                                
                                <div class="modal-content">
                                
                                    <div class="modal-header">
                                        <h5 class="modal-title">
                                            {{ editingPatientId ? 'Editar paciente' : 'Nuevo paciente' }}
                                        </h5>
                                        
                                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                    </div>

                                    <div class="modal-body">

                                        <div v-if="patientsError" class="text-danger small mt-1">{{ patientsError }}</div>

                                        
                                        <form id="usuarioForm" class="needs-validation" novalidate @submit.prevent="savePatient">
                                            <!-- ================================ -->
                                            <!-- SECCIÓN: IDENTIFICACIÓN -->
                                            <!-- ================================ -->
                                            <!-- Identificación -->
                                            <h2 class="h6 mb-3">Identificación</h2>

                                            <div class="row g-3">
                                                <div class="col-12 col-md-12">
                                                    <label for="id_paciente" class="form-label">RUN *</label>
                                                    <input type="text" class="form-control" id="id_paciente" name="Id" required v-model="patientForm.id_paciente" :readonly="!!editingPatientId" />
                                                    <div class="invalid-feedback">Ingresa con su RUT.</div>
                                                    <small v-if="editingPatientId" class="text-muted">
                                                        El RUT no puede modificarse una vez creado.
                                                    </small>
                                                </div>

                                                <div class="col-12 col-md-12">
                                                    <label for="usuario" class="form-label">Usuario *</label>
                                                    <input type="text" class="form-control" id="usuario" name="Usuario" v-model="patientForm.usuario"/>
                                                    <div class="invalid-feedback">Ingresa el nombre de usuario.</div>
                                                </div>

                                                <div class="col-12 col-md-12">
                                                    <label for="nombres" class="form-label">Nombres *</label>
                                                    <input type="text" class="form-control" id="nombres" name="Nombres" required v-model="patientForm.nombres"/>
                                                    <div class="invalid-feedback">Ingresa los nombres.</div>
                                                </div>

                                                <div class="col-12 col-md-12">
                                                    <label for="apellidoPaterno" class="form-label">Apellido Paterno *</label>
                                                    <input type="text" class="form-control" id="apellidoPaterno" name="Apellido Paterno" required v-model="patientForm.apellido_paterno"/>
                                                    <div class="invalid-feedback">Ingresa el apellido paterno.</div>
                                                </div>

                                                <div class="col-12 col-md-12">
                                                    <label for="apellidoMaterno" class="form-label">Apellido Materno</label>
                                                    <input type="text" class="form-control" id="apellidoMaterno" name="Apellido Materno" required v-model="patientForm.apellido_materno"/>
                                                </div>
                                            </div>

                                            <hr class="my-4" />

                                            <!-- ================================ -->
                                            <!-- SECCIÓN: CONTACTO -->
                                            <!-- ================================ -->
                                            <!-- Contacto -->
                                            <h2 class="h6 mb-3">Contacto</h2>

                                            <div class="row g-3">
                                                <div class="col-12 col-md-12">
                                                    <label for="correo" class="form-label">Correo</label>
                                                    <input type="email" class="form-control" id="correo" name="Correo" placeholder="correo@ejemplo.cl" required v-model="patientForm.email"/>
                                                    <div class="invalid-feedback">Correo no válido.</div>
                                                </div>

                                                <div class="col-12 col-md-12">
                                                    <label for="celular" class="form-label">Celular</label>
                                                    <input type="tel" class="form-control" id="celular" name="Celular" placeholder="+56 9 1234 5678" required v-model="patientForm.contacto"/>
                                                </div>
                                            </div>

                                            <hr class="my-4" />

                                            <!-- Datos personales -->
                                            <h2 class="h6 mb-3">Datos personales</h2>

                                            <div class="row g-3">
                                                <div class="col-12 col-md-12">
                                                    <label for="fechaNacimiento" class="form-label">Fecha de Nacimiento</label>
                                                    <input type="date" class="form-control" id="fechaNacimiento" name="Fecha De Nacimiento" required v-model="patientForm.fecha_nacimiento"/>
                                                </div>

                                                <div class="col-12">
                                                    <label for="edad" class="form-label">Edad</label>
                                                    <input type="number" class="form-control" id="edad" name="Edad" min="0" max="130" v-model="patientForm.edad" />
                                                </div>

                                                <div class="col-12">
                                                    <label for="genero" class="form-label">Género</label>
                                                    <select class="form-select" id="genero" name="Genero" required v-model="patientForm.genero">
                                                    <option value="" selected>Seleccionar...</option>
                                                    <option value="F">Femenino</option>
                                                    <option value="M">Masculino</option>
                                                    <option value="NB">No binario</option>
                                                    <option value="OTRO">Otro</option>
                                                    <option value="NA">Prefiere no decir</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <hr class="my-4" />

                                            <!-- ================================ -->
                                            <!-- SECCIÓN: DIRECCIÓN -->
                                            <!-- ================================ -->
                                            <!-- Dirección -->
                                            <h2 class="h6 mb-3">Dirección</h2>

                                            <div class="row g-3">
                                                <div class="col-12">
                                                    <label for="direccion" class="form-label">Dirección</label>
                                                    <input type="text" class="form-control" id="direccion" name="Dirección" required v-model="patientForm.direccion" />
                                                </div>

                                                <div class="col-12">
                                                    <label for="region" class="form-label">Región</label>
                                                    <input type="text" class="form-control" id="region" name="Región" required v-model="patientForm.region" />
                                                </div>

                                                <div class="col-12">
                                                    <label for="provincia" class="form-label">Provincia</label>
                                                    <input type="text" class="form-control" id="provincia" name="Provincia" required v-model="patientForm.provincia" />
                                                </div>

                                                <div class="col-12">
                                                    <label for="comuna" class="form-label">Comuna</label>
                                                    <input type="text" class="form-control" id="comuna" name="Comuna" required v-model="patientForm.comuna" />
                                                </div>
                                            </div>

                                            <hr class="my-4" />

                                            <!-- ================================ -->
                                            <!-- SECCIÓN: SALUD -->
                                            <!-- ================================ -->
                                            <!-- Salud -->
                                            <h2 class="h6 mb-3">Salud</h2>

                                            <div class="row g-31">
                                                <div class="col-12">
                                                    <label for="discapacidad" class="form-label">% de Discapacidad</label>
                                                    <input type="number" class="form-control" id="discapacidad" name="% De Discapacidad" min="0" max="100" step="1" v-model="patientForm.porcentaje_discapacidad"/>
                                                </div>

                                                <div class="col-12">
                                                    <label for="condicion" class="form-label">Condición</label>
                                                    <select class="form-select" id="condicion" name="Condición" v-model="patientForm.condiciones">
                                                    <option value="" selected>Seleccionar...</option>
                                                    <option value="Sorda">Sorda</option>
                                                    <option value="Hipoacusia">Hipoacusia</option>
                                                    <option value="Movilidad reducida">Movilidad reducida</option>
                                                    <option value="Otra">Otra</option>
                                                    </select>
                                                </div>

                                                <div class="col-12">
                                                    <label for="nacionalidad" class="form-label">Nacionalidad</label>
                                                    <input type="text" class="form-control" id="nacionalidad" name="Nacionalidad" placeholder="Chilena, Peruana, ..." v-model="patientForm.nacionalidad" />
                                                </div>

                                                <div class="col-12">
                                                    <label for="establecimiento" class="form-label">Establecimiento</label>
                                                    <input type="text" class="form-control" id="establecimiento" name="cual es su inscrito del establecimiento" placeholder="Ej: HTA, Diabetes, ..."  v-model="patientForm.establecimiento"/>
                                                </div>

                                                <div class="col-12 col-md-6">
                                                    <label for="sector" class="form-label">Sector</label>
                                                    <input type="text" class="form-control" id="sector" name="Cual es su sector" v-model="patientForm.sector"/>
                                                </div>
                                            </div>

                                            <hr class="my-4" />

                                            <!-- ================================ -->
                                            <!-- SECCIÓN: ESTADO Y NOTIFICACIONES -->
                                            <!-- ================================ -->
                                            <!-- Estado / Notificaciones -->
                                            <h2 class="h6 mb-3">Estado y notificaciones</h2>

                                            <div class="row g-3 align-items-end">
                                                <div class="col-12 col-md-4">
                                                    <div class="form-check">
                                                    <input class="form-check-input" type="checkbox" id="vigencia" name="vigencia" :true-value="1" :false-value="0" v-model="patientForm.vigente" />
                                                    <label class="form-check-label" for="vigencia">
                                                        Vigencia (activo)
                                                    </label>
                                                    </div>
                                                </div>

                                                <div class="col-12 col-md-4">
                                                    <div class="form-check">
                                                    <input class="form-check-input" type="checkbox" value="true" id="notificacion" name="Notificación" />
                                                    <label class="form-check-label" for="notificacion">
                                                        Notificación habilitada
                                                    </label>
                                                    </div>
                                                </div>

                                                <div class="col-12 col-md-4">
                                                    <div class="form-check">
                                                        <input class="form-check-input" type="checkbox" value="true" id="enviando" name="¿Enviando?" />
                                                        <label class="form-check-label" for="enviando">¿Enviando?</label>
                                                    </div>
                                                </div>
                                            </div>

                                            <hr class="my-4" />

                                            <!-- ================================ -->
                                            <!-- SECCIÓN: MULTIMEDIA -->
                                            <!-- ================================ -->
                                            <!-- Multimedia -->
                                            <h2 class="h6 mb-3">Multimedia</h2>

                                            <div class="row g-3">
                                                <div class="col-12 col-md-6">
                                                    <label for="fotografia" class="form-label">Fotografía</label>
                                                    <input class="form-control" type="file" id="fotografia" name="Fotografía" accept="image/*" />
                                                    <div class="form-text">Sube una imagen (JPG/PNG).</div>
                                                </div>

                                                <div class="col-12 col-md-6">
                                                    <label for="scanqr" class="form-label">ScanQR</label>
                                                    <input type="text" class="form-control" id="scanqr" name="ScanQR" placeholder="Código / texto QR" />
                                                </div>
                                            </div>

                                            <hr class="my-4" />

                                            <!-- ================================ -->
                                            <!-- SECCIÓN: METADATOS -->
                                            <!-- ================================ -->
                                            <!-- Metadatos -->
                                            <h2 class="h6 mb-3">Metadatos</h2>

                                            <div class="row g-3">
                                                <div class="col-12 col-md-6">
                                                    <label for="creacion" class="form-label">Creación</label>
                                                    <input type="datetime-local" id="creacion" class="form-control" v-model="patientForm.created_at" disabled/>
                                                </div>

                                                <div class="col-12 col-md-6">
                                                    <label for="actualizacion" class="form-label">Actualización</label>
                                                    <input type="datetime-local" id="actualizacion" class="form-control" v-model="patientForm.updated_at" disabled />
                                                </div>
                                            </div>

                                            <!-- ================================ -->
                                            <!-- BOTONES DE ACCIÓN -->
                                            <!-- ================================ -->
                                            <div class="d-flex gap-2 mt-4">
                                                <!-- Botón para guardar cambios del paciente -->
                                                <button type="submit" class="btn btn-primary">Guardar</button>
                                            
                                                <!-- Botón para limpiar formulario -->
                                                <button type="reset" class="btn btn-outline-secondary" @click="resetPatientForm">Limpiar</button>
                                            </div>
                                        </form>
                                    </div>
                            

                                </div>
                            </div>
                        </div>
                        
                        <!-- FIN: Modal de paciente -->

                        <!-- ================================ -->
                        <!-- MODAL DE CITA (CREATE/EDIT) -->
                        <!-- ================================ -->
                        <div class="modal fade" id="appointmentModal" tabindex="-1" aria-hidden="true"></div>
                        <!-- FIN: Modal de cita -->

                        <!-- ================================ -->
                        <!-- MODAL DE USUARIO (CREATE/EDIT) -->
                        <!-- ================================ -->

                        <div class="modal fade" id="userModalUsers" tabindex="-1" aria-hidden="true">

                            <div class="modal-dialog modal-dialog-centered">

                                <div class="modal-content">

                                    <div class="modal-header">
                                        <h5 class="modal-title"> {{ form.id ? 'Editar usuario' : 'Nuevo usuario' }} </h5>
                                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                    </div>

                                    <div class="modal-body">

                                        <div v-if="errorMsg" class="alert alert-danger">{{ errorMsg }}</div>


                                        <div class="mb-3">
                                            <label class="form-label" for="userName">Nombre</label>
                                            <input class="form-control" type="text" id="userName" name="userName" placeholder="Ingresa con su nombre" v-model="form.name" />
                                        </div>

                                        <div class="mb-3" v-if="!form.id">
                                            <label class="form-label" for="userEmail">Email</label>
                                            <input class="form-control" type="email" id="userEmail" placeholder="Ingresa su email" v-model="form.email" />
                                        </div>

                                        <div class="mb-3">
                                            <label class="form-label">Cual es el rol del usuario</label>
                                            <select class="form-select" aria-label="Selecciona un rol" v-model="form.role">
                                                <option value="admin">admin</option>
                                                <option value="staff">staff</option>
                                                <option value="user">user</option>
                                                <option value="interpreter">interpreter</option>
                                            </select>
                                        </div>

                                        <div class="mb-3">
                                            <label class="form-label">Cual es su estado</label>
                                            <select class="form-select" aria-label="Selecciona un estado" v-model="form.status">
                                                <option value="active">Activo</option>
                                                <option value="inactive">Inactivo</option>
                                            </select>
                                        </div>

                                        <div class="mb-3">
                                            <label class="form-label" for="userPassword">{{ form.id ? 'Nueva contraseña (opcional)' : 'Password' }}</label>
                                            <input class="form-control" type="password" id="userPassword" v-model="form.password" />
                                        </div>
                                    </div>

                                    <div class="modal-footer">
                                        <button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                                        <button class="btn btn-primary" @click="saveUser">Guardar</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                          <!-- ✅ End Modal New Paciente -->
                        <!-- FIN: Modal de usuario -->

                    </div>
                    <!-- end: Main content -->
                </div>
            </div>
        </div>
        <!-- end: Body content -->
    </div>
</div>
`,
}).mount("#app");
