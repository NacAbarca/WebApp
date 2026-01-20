// frontend/src/app.js
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

    const patients = ref([]);
    const patientsError = ref("");

    let userModal = null;        // modal usuarios (admin)
    let patientModal = null;     // modal pacientes
    let appointmentModal = null; // modal citas

    async function loadPatients() {
      patientsError.value = "";
      try {
        const data = await api({ path: "patients" });
        patients.value = data.patients || [];
      } catch (e) {
        patientsError.value = e.message;
        patients.value = [];
      }
    }

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

    let modal = null;

    const canManageUsers = computed(() => user.value?.role === "admin");

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

    function openCreate() {
      if (!canManageUsers.value) return;
      form.value = { id: null, name: "", email: "", role: "user", status: "active", password: "" };
      modal?.show();
    }

    function openEdit(u) {
      if (!canManageUsers.value) return;
      form.value = { id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, password: "" };
      modal?.show();
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

        modal?.hide();
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



    const canCreateAppointment = computed(() => createDisabledReason.value === "");

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
              id_paciente: apptForm.value.id_paciente ? Number(apptForm.value.id_paciente) : null,
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

    function openCreatePatient() {
      // si quieres: permitir admin/staff (mejor que admin-only)
      if (!user.value || !["admin", "staff"].includes(user.value.role)) return;

      // aquí crea un objeto patientForm real (recomendado) en vez de reutilizar form de users
      // patientForm.value = { ...defaults }
      patientModal?.show();
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
        await loadUsersSafe();
        await loadAppointmentsSafe();

        if (["admin", "staff"].includes(user.value.role)) {
          await loadPatients();
        }
      }

      initTooltips();
    });


    // Re-init tooltips cuando cambie el mensaje
    watch(createDisabledReason, () => initTooltips());

    return {
      // auth
      email, password, user, loading, errorMsg, login, logout,

      // users
      users, form, canManageUsers,
      openCreate, openEdit, saveUser, deactivate, deleteUser,

      // appts
      appointments, apptError, apptForm,
      selectableUsers,
      canCreateAppointment, createDisabledReason,
      loadAppointments: loadAppointmentsSafe,
      createAppointment,
      setAppointmentStatus,
      cancelAppointment,
      dbToUi,
      
      openCreatePatient, openCreateAppointmentModal,


      view, go, isAdmin, canAudit,


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

                <li>
                    <a href="#" class="nav-link active px-2 link-secondary" :class="{ active: view==='appointments' }" @click="go('appointments')">📅 Citas</a>
                </li>
                <li><a href="#" class="nav-link px-2 link-body-emphasis" :class="{ active: view==='patient' }" @click="go('patient')">👥 Pacientes</a></li>
                <div v-if="isAdmin"> <li><a href="#" class="nav-link px-2 link-body-emphasis" :class="{ active: view==='history' }" @click="go('history')">🕘 Historial</a></li> </div>
                <div v-if="isAdmin"> <li><a href="#" class="nav-link px-2 link-body-emphasis" :class="{ active: view==='users' }" @click="go('users')">👥 Equipos</a></li> </div>
                <div v-if="isAdmin"> <li><a href="#" class="nav-link px-2 link-body-emphasis" :class="{ active: view==='settings' }" @click="go('settings')">⚙️ Ajustes</a></li> </div>
                <div v-if="isAdmin"> <li><a href="#" class="nav-link px-2 link-body-emphasis" :class="{ active: view==='audit' }" @click="go('audit')">🧾 Auditoría</a></li> </div>

              </ul>

              <form class="col-12 col-lg-auto mb-3 mb-lg-0 me-lg-3" role="search">
                <input type="search" class="form-control" placeholder="Search..." aria-label="Search">
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
            <div class="col col-2">
                      
                SideBar (Pendiente)

            <button
            class="btn btn-sm btn-success"
            :disabled="!canManageUsers"
            @click="openCreate"
            >
              + Nuevo usuario
            </button>

            <div class="d-grid gap-2">
  <button type="button" class="btn btn-sm btn-primary" @click="openCreatePatient">
    + Nuevo paciente
  </button>

  <button type="button" class="btn btn-sm btn-success" @click="openCreateAppointmentModal">
    + Nueva cita
  </button>
</div>


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

            <!------------USUARIOS Y ADMIN ------------------>
            <div v-if="view==='users' && isAdmin">
              <div class="alert alert-success d-flex justify-content-between align-items-center">
                <div>✅ Sesión activa — <b>{{ user.email }}</b> ({{ user.role }})</div>

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
              <div class="card shadow-sm mb-4">

                <div class="card-header d-flex justify-content-between align-items-center">
                  <div class="fw-semibold">Usuarios</div>
                </div>

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
                          <button class="btn btn-sm btn-outline-primary" :disabled="!canManageUsers" @click="openEdit(u)">
                            Editar
                          </button>

                          <button class="btn btn-sm btn-outline-warning" :disabled="!canManageUsers" @click="deactivate(u)">
                            Desactivar
                          </button>

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
                  <button class="btn btn-sm btn-outline-secondary" @click="loadUsersSafe">Refrescar</button>
                </div>

              </div>
            </div>

            <!-- ========================= -->
            <!-- CITAS -->
            <!-- ========================= -->
            <div v-if="view==='appointments'">

              <div v-if="apptError" class="alert alert-danger">{{ apptError }}</div>

              <div class="card shadow-sm mb-4">
                <div class="card-header">

                  <div class="d-flex justify-content-between align-items-center">
                    <h5 class="h5 mb-0">Gestion de citas</h5>
                    <button class="btn btn-sm btn-outline-secondary" @click="loadAppointments">Refrescar</button>
                  </div>

                </div>
                <div class="card-body">

                  <div class="row g-2 align-items-end">
                    <div class="col-md-3">
                      
                      <label class="form-label">Usuario</label>
                        
                        <select class="form-select" v-model="apptForm.user_id">
                          <option value="">Selecciona usuario</option>
                          <option v-for="u in selectableUsers" :key="u.id" :value="String(u.id)">
                            {{ u.name }} ({{ u.email }})
                          </option>
                        </select>

                    </div>

                    <div class="col-md-3">
                        <label class="form-label">Inicio (DD-MM-YYYY HH:MM)</label>
                        <input type="text" class="form-control" v-model="apptForm.start_at" placeholder="15-01-2026 10:00" />
                    </div>

                    <div class="col-md-3">
                        <label class="form-label">Termino (DD-MM-YYYY HH:MM)</label>
                        <input type="text" class="form-control" v-model="apptForm.end_at" placeholder="11-01-2026 10:30" />
                    </div>

                    <div class="col-md-2">
                        <label class="form-label">Notas</label>
                        <input class="form-control" v-model="apptForm.notes" placeholder="Motivo..." />
                    </div>

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
                          <td class="d-flex flex-wrap gap-2">
                              <button class="btn btn-sm btn-outline-primary" @click="setAppointmentStatus(a,'confirmed')">Confirmar</button>
                              <button class="btn btn-sm btn-outline-success" @click="setAppointmentStatus(a,'done')">Done</button>
                              <button class="btn btn-sm btn-outline-warning" @click="setAppointmentStatus(a,'no_show')">No-show</button>
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

            <!-----------PACIENTES---------->
            <div v-if="view==='patient'" class="card shadow-sm mb-4">
              <div class="card-header">

                <div class="d-flex justify-content-between align-items-center">
                  <h2 class="h5 mb-2">Gestion de usuarios</h2>
                  <button class="btn btn-sm btn-outline-secondary" @click="">Nueva cuenta</button>
                </div>
                
              </div>
              <div class="card-body">
                <div class="text-muted">
                  <div class="col-md-3">
                    <label class="form-label">Paciente</label>
                    <select class="form-select" v-model="apptForm.id_paciente">
                      <option value="">-- Sin paciente --</option>
                      <option v-for="p in patients" :key="p.id_paciente" :value="p.id_paciente">
                        {{ p.rut }} — {{ p.nombres }} {{ p.apellido_paterno }} {{ p.apellido_materno }}
                      </option>
                    </select>
                    <div v-if="patientsError" class="text-danger small mt-1">{{ patientsError }}</div>
                  </div>
                </div>

                <table class="table">
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">First</th>
                      <th scope="col">Last</th>
                      <th scope="col">Handle</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">1</th>
                      <td>Mark</td>
                      <td>Otto</td>
                      <td>@mdo</td>
                    </tr>
                    <tr>
                      <th scope="row">2</th>
                      <td>Jacob</td>
                      <td>Thornton</td>
                      <td>@fat</td>
                    </tr>
                    <tr>
                      <th scope="row">3</th>
                      <td>John</td>
                      <td>Doe</td>
                      <td>@social</td>
                    </tr>
                  </tbody>
                </table>
                
              </div>

              <div class="card-footer">
                <button class="btn btn-sm btn-outline-secondary" @click="loadAppointments">Refrescar</button>
              </div>  
            </div>              

            <!-----------HISTORIAL---------->
            <div v-if="view==='history'" class="card shadow-sm mb-4">
              <div class="card-header">

                <div class="d-flex justify-content-between align-items-center">
                  <h2 class="h5 mb-2">Historial</h2>
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

                          <!-----------AJUSTES---------->
            <div v-if="view==='settings'" class="card shadow-sm mb-4">
              <div class="card-header">

                <div class="d-flex justify-content-between align-items-center">
                    <h2 class="h5 mb-2">Ajustes</h2>
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
            <!-----------AUDITORIA---------->
            <div v-if="view==='audit' && canAudit" class="card shadow-sm mb-4">
                <div class="card-header">

                <div class="d-flex justify-content-between align-items-center">
                    <h2 class="h5 mb-2">Auditoría</h2>
                    <button class="btn btn-sm btn-outline-secondary" @click="loadAppointments">Refrescar</button>
                </div>

        </div>
                              <div class="card-body">
                              <div class="text-muted">Próximo sprint: eventos (login, cambios usuarios, cambios citas).</div>
                              </div>
                              <div class="card-footer">
                              footer
                              </div>  
                          </div>

                          <!---- Create Paciente – Modal ---->

                          <div class="modal fade" id="patientModal" tabindex="-1" aria-hidden="true">
                            <div class="modal-dialog modal-lg modal-dialog-centered">
                              <div class="modal-content">

                                <div class="modal-header">
                                  <h5 class="modal-title"> {{ form.id ? 'Editar paciente' : 'Nuevo paciente' }} </h5>
                                  <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                </div>

                                <div class="modal-body">
                                  <form id="usuarioForm" class="needs-validation" novalidate>
                                    <!-- Identificación -->
                                    <h2 class="h6 mb-3">Identificación</h2>

                                    <div class="row g-3">
                                      <div class="col-12 col-md-4">
                                        <label for="id" class="form-label">ID *</label>
                                        <input type="text" class="form-control" id="id" name="Id" required />
                                        <div class="invalid-feedback">Ingresa el ID.</div>
                                      </div>

                                      <div class="col-12 col-md-8">
                                        <label for="usuario" class="form-label">Usuario *</label>
                                        <input type="text" class="form-control" id="usuario" name="Usuario" required />
                                        <div class="invalid-feedback">Ingresa el nombre de usuario.</div>
                                      </div>

                                      <div class="col-12 col-md-4">
                                        <label for="nombres" class="form-label">Nombres *</label>
                                        <input type="text" class="form-control" id="nombres" name="Nombres" required />
                                        <div class="invalid-feedback">Ingresa los nombres.</div>
                                      </div>

                                      <div class="col-12 col-md-4">
                                        <label for="apellidoPaterno" class="form-label">Apellido Paterno *</label>
                                        <input type="text" class="form-control" id="apellidoPaterno" name="Apellido Paterno" required />
                                        <div class="invalid-feedback">Ingresa el apellido paterno.</div>
                                      </div>

                                      <div class="col-12 col-md-4">
                                        <label for="apellidoMaterno" class="form-label">Apellido Materno</label>
                                        <input type="text" class="form-control" id="apellidoMaterno" name="Apellido Materno" />
                                      </div>
                                    </div>

                                    <hr class="my-4" />

                                    <!-- Contacto -->
                                    <h2 class="h6 mb-3">Contacto</h2>

                                    <div class="row g-3">
                                      <div class="col-12 col-md-6">
                                        <label for="correo" class="form-label">Correo</label>
                                        <input type="email" class="form-control" id="correo" name="Correo" placeholder="correo@ejemplo.cl" />
                                        <div class="invalid-feedback">Correo no válido.</div>
                                      </div>

                                      <div class="col-12 col-md-6">
                                        <label for="celular" class="form-label">Celular</label>
                                        <input type="tel" class="form-control" id="celular" name="Celular" placeholder="+56 9 1234 5678" />
                                      </div>
                                    </div>

                                    <hr class="my-4" />

                                    <!-- Datos personales -->
                                    <h2 class="h6 mb-3">Datos personales</h2>

                                    <div class="row g-3">
                                      <div class="col-12 col-md-4">
                                        <label for="fechaNacimiento" class="form-label">Fecha de Nacimiento</label>
                                        <input type="date" class="form-control" id="fechaNacimiento" name="Fecha De Nacimiento" />
                                      </div>

                                      <div class="col-12 col-md-2">
                                        <label for="edad" class="form-label">Edad</label>
                                        <input type="number" class="form-control" id="edad" name="Edad" min="0" max="130" />
                                      </div>

                                      <div class="col-12 col-md-6">
                                        <label for="genero" class="form-label">Género</label>
                                        <select class="form-select" id="genero" name="Genero">
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

                                    <!-- Dirección -->
                                    <h2 class="h6 mb-3">Dirección</h2>

                                    <div class="row g-3">
                                      <div class="col-12">
                                        <label for="direccion" class="form-label">Dirección</label>
                                        <input type="text" class="form-control" id="direccion" name="Dirección" />
                                      </div>

                                      <div class="col-12 col-md-4">
                                        <label for="region" class="form-label">Región</label>
                                        <input type="text" class="form-control" id="region" name="Región" />
                                      </div>

                                      <div class="col-12 col-md-4">
                                        <label for="provincia" class="form-label">Provincia</label>
                                        <input type="text" class="form-control" id="provincia" name="Provincia" />
                                      </div>

                                      <div class="col-12 col-md-4">
                                        <label for="comuna" class="form-label">Comuna</label>
                                        <input type="text" class="form-control" id="comuna" name="Comuna" />
                                      </div>
                                    </div>

                                    <hr class="my-4" />

                                    <!-- Salud -->
                                    <h2 class="h6 mb-3">Salud</h2>

                                    <div class="row g-3">
                                      <div class="col-12 col-md-4">
                                        <label for="discapacidad" class="form-label">% de Discapacidad</label>
                                        <input type="number" class="form-control" id="discapacidad" name="% De Discapacidad" min="0" max="100" step="1" />
                                      </div>

                                      <div class="col-12 col-md-4">
                                        <label for="condicion" class="form-label">Condición</label>
                                        <select class="form-select" id="condicion" name="Condición">
                                          <option value="" selected>Seleccionar...</option>
                                          <option value="Sorda">Sorda</option>
                                          <option value="Hipoacusia">Hipoacusia</option>
                                          <option value="Movilidad reducida">Movilidad reducida</option>
                                          <option value="Otra">Otra</option>
                                        </select>
                                      </div>

                                      <div class="col-12 col-md-4">
                                        <label for="nacionalidad" class="form-label">Nacionalidad</label>
                                        <input type="text" class="form-control" id="nacionalidad" name="Nacionalidad" placeholder="Chilena, Peruana, ..." />
                                      </div>

                                      <div class="col-12">
                                        <label for="patologia" class="form-label">Patología Crónica</label>
                                        <input type="text" class="form-control" id="patologia" name="Patología Cronica" placeholder="Ej: HTA, Diabetes, ..." />
                                      </div>

                                      <div class="col-12 col-md-6">
                                        <label for="fechaFallecida" class="form-label">Fecha de Fallecida</label>
                                        <input type="date" class="form-control" id="fechaFallecida" name="Fecha De Fallecida" />
                                      </div>
                                    </div>

                                    <hr class="my-4" />

                                    <!-- Estado / Notificaciones -->
                                    <h2 class="h6 mb-3">Estado y notificaciones</h2>

                                    <div class="row g-3 align-items-end">
                                      <div class="col-12 col-md-4">
                                        <div class="form-check">
                                          <input class="form-check-input" type="checkbox" value="true" id="vigencia" name="Vigencia" />
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
                                          <label class="form-check-label" for="enviando">
                                            ¿Enviando?
                                          </label>
                                        </div>
                                      </div>
                                    </div>

                                    <hr class="my-4" />

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

                                    <!-- Metadatos -->
                                    <h2 class="h6 mb-3">Metadatos</h2>

                                    <div class="row g-3">
                                      <div class="col-12 col-md-6">
                                        <label for="creacion" class="form-label">Creación</label>
                                        <input type="datetime-local" class="form-control" id="creacion" name="Creación" />
                                      </div>

                                      <div class="col-12 col-md-6">
                                        <label for="actualizacion" class="form-label">Actualización</label>
                                        <input type="datetime-local" class="form-control" id="actualizacion" name="Actualización" />
                                      </div>
                                    </div>

                                    <div class="d-flex gap-2 mt-4">
                                      <button type="submit" class="btn btn-primary">Guardar</button>
                                      <button type="reset" class="btn btn-outline-secondary">Limpiar</button>
                                    </div>
                                  </form>
                                </div>

      </div>
    </div>
  </div>

                          <!---- Create Paciente – Modal ---->                      
                          <!-- ✅ Modal New Users (NECESARIO para que el botón funcione) -->

                          <div class="modal fade" id="appointmentModal" tabindex="-1" aria-hidden="true">
                          
                            <div class="modal-dialog modal-lg modal-dialog-centered">

                              <div class="modal-content">

                                    <div class="modal-header">
                                        <h5 class="modal-title"> {{ form.id ? 'Editar paciente' : 'Nuevo paciente' }} </h5>
                                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                    </div>

                                    <div class="modal-body">

                                        <div v-if="errorMsg" class="alert alert-danger">{{ errorMsg }}</div>

                                        <div class="form-group mb-3">
                                            <label class="form-label" for="pacienteCreate"> Creación </label>
                                            <input class="form-control" type="text" id="pacienteCreate" placeholder="Ej: 19-01-2026" aria-label="Ej: 19-01-2026"  disabled v-model="form.create" >
                                        </div>

                                        <div class="form-group mb-3">
                                            <label class="form-label" for="pacienteUpdate"> actualización </label>
                                            <input class="form-control" type="text" id="pacienteUpdate" placeholder="Ej: 19-01-2026" aria-label="Ej: 19-01-2026" readonly v-model="form.update">
                                        </div>

                                        <div class="form-group mb-3">

                                            <label class="form-label" for="pacienteRUT"> RUT </label>
                                            <input class="form-control" type="text" id="pacienteRUT" placeholder="Ingrese el RUT del paciente" v-model="form.rut">

                                        </div>

                                        <div class="form-group mb-3">
                                            <label class="form-label" for="pacienteEstado"> Estado </label>

                                            <div class="form-control">

                                                <input type="radio" class="btn-check" name="options-outlined" id="success-outlined" autocomplete="off" checked v-model="form.estado">
                                                <label class="btn btn-outline-success" for="success-outlined">Activo</label>

                                                <input type="radio" class="btn-check" name="options-outlined" id="danger-outlined" autocomplete="off" v-model="form.estado">
                                                <label class="btn btn-outline-danger" for="danger-outlined">Inactivo</label>
                                            
                                            </div>
                                        </div>

                                        <div class="form-group mb-3">

                                            <label class="form-label" for="pacienteInstrumento"> Instrumento </label>
                                            <select class="form-select" id="pacienteInstrumento" aria-label="Seleccionar una prestacion" v-model="form.instrumento">
                                                <option selected>Seleccionar una prestacion</option>
                                                <option value="1">Médico</option>
                                                <option value="2">Matróna</option>
                                                <option value="3">Psicologia</option>
                                            </select>

                                        </div>

                                        <div class="form-group mb-3">

                                            <label class="form-label" for="pacienteRazonCita"> Razon cita </label>
                                            <select class="form-select" id="pacienteRazonCita" aria-label="Default select example" v-model="form.razonCita">
                                                <option selected>Cual es su razón</option>
                                                <option value="1">Consulta</option>
                                                <option value="2">Control</option>
                                                <option value="3">Urgencia</option>
                                                <option value="4">Toma de muestras</option>
                                                <option value="5">Ingreso</option>
                                                <option value="6">Visita Domiciliaria</option>
                                                <option value="4">Vacunatorio</option>
                                                <option value="7">Imaginologicos</option>
                                                <option value="8">Ginegologicos</option>
                                                <option value="9">Cardiologicos</option>
                                                <option value="10">Otro</option>
                                            </select>

                                        </div>

                                        <div class="form-group mb-3">

                                            <label class="form-label" for="pacienteFechaCita"> Fecha de cita </label>
                                            <input class="form-control" type="text" id="pacienteFechaCita" v-model="form.fechaCita">

                                        </div>

                                        <div class="form-group mb-3">

                                            <label class="form-label" for="pacienteHoraInicio"> Hora inicio </label>
                                            <input class="form-control" type="text" id="pacienteHoraInicio" v-model="form.horaInicio">

                                        </div>

                                        <div class="form-group mb-3">

                                            <label class="form-label" for="pacienteHoraTermino"> Hora termino </label>
                                            <input class="form-control" type="text" id="pacienteHoraTermino" v-model="form.horaTermino">

                                        </div>

                                        <div class="form-group mb-3">

                                            <label class="form-label" for="pacienteSector"> Sector </label>
                                            <select class="form-select" id="pacienteSector" aria-label="asignado a sector" v-model="form.sector">
                                                <option selected>Cual es su sector</option>
                                                <option value="1">Amarillo</option>
                                                <option value="2">Gris</option>
                                                <option value="3">Azul</option>
                                                <option value="4">Rojo</option>
                                                <option value="5">Verde</option>
                                                <option value="6">Patio central</option>
                                                <option value="4">Transversal</option>
                                                <option value="7">Particular</option>
                                                <option value="8">Sin informado</option>
                                                <option value="10">Otro</option>
                                            </select>

                                        </div>

                                        <div class="form-group mb-3">

                                            <label for="pacienteObservacion" class="form-label">Observación</label>
                                            <textarea class="form-control" id="pacienteObservacion" rows="3" v-model="form.observacion"></textarea>

                                        </div>

                                        <div class="form-group mb-3">
                                            <label class="form-label" for="pacienteEstablecimiento"> Establecimiento </label>
                                            <input class="form-control" type="text" id="pacienteEstablecimiento" v-model="form.establecimiento">

                                            <select class="form-select" id="pacienteEstablecimiento" aria-label="Asignado a una establecimiento" v-model="form.sector">
                                                <option selected>Cual es su establecimiento</option>
                                                <option value="1">CESFAM Santa Laura</option>
                                                <option value="2">SAPU Santa Laura</option>
                                                <option value="3">x</option>
                                                <option value="4">x</option>
                                                <option value="5">x</option>
                                                <option value="6">x</option>
                                                <option value="4">x</option>
                                                <option value="7">x</option>
                                                <option value="8">x</option>
                                                <option value="10">x</option>
                                            </select>
                                        </div>

                                        <div class="form-group mb-3">
                                            <label class="form-label" for="pacienteCitaCreadaPor"> Cita creada por </label>
                                            <input class="form-control" type="text" id="pacienteCitaCreadaPor" placeholder="Ej: Nac Abarca" aria-label="Ej: 19-01-2026" readonly v-model="form.citaCreadaPor">
                                        </div>

                                        <div class="form-group mb-3">
                                            <label class="form-label" for="pacienteTipoAtencion"> Tipo de atención </label>
                                            <input class="form-control" type="text" id="pacienteTipoAtencion" v-model="form.tipoAtencion">
                                        </div>

                                        <div class="form-group mb-3">
                                            <label class="form-label" for="pacienteEspecialidad"> Especialidad </label>
                                            <input class="form-control" type="text" id="pacienteEspecialidad" v-model="form.especialidad">
                                        </div>

                                        <div class="form-group mb-3">
                                            <label class="form-label" for="pacienteDato1"> dato </label>
                                            <input class="form-control" type="text" id="pacienteDato1" v-model="form.dato1">
                                        </div>

                                        <div class="form-group mb-3">
                                            <label class="form-label" for="pacienteDato2"> dato </label>
                                            <input class="form-control" type="text" id="pacienteDato2" v-model="form.dato2">
                                        </div>

                                        <div class="form-group mb-3">
                                            <label class="form-label" for="pacienteDato3"> dato </label>
                                            <input class="form-control" type="text" id="pacienteDato3" v-model="form.dato3">
                                        </div>


                                        <div class="modal-footer">
                                        <button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                                        <button class="btn btn-primary" @click="">Guardar</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                          </div>
                          <!-- ✅ End Modal New Users -->

                          <!-- ✅ Modal New Users (NECESARIO para que el botón funcione) -->


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
                                      <input class="form-control" type="text" id="userName" placeholder="Ingresa con su nombre" v-model="form.name" />
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

                          <!-- Panel -->
                      </div>
                      <!-- end: Main content -->
</div>

  `,
}).mount("#app");
