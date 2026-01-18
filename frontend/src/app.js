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

    onMounted(async () => {
      await loadMe();

      const modalEl = document.getElementById("userModal");
      if (modalEl) {
        modal = new bootstrap.Modal(modalEl);

        // Fix accesibilidad: evita el warning aria-hidden/focus
        modalEl.addEventListener("hidden.bs.modal", () => {
          if (document.activeElement) document.activeElement.blur();
        });
      }

      if (user.value) {
        await loadUsersSafe();
        await loadAppointmentsSafe();
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


      view, go, isAdmin, canAudit,


    };
  },

  template: `
  <div class="container-fluid">
    <div class="row">
      <div class="col col-12">

        <header class="p-3 mb-3 border-bottom"> 
          <div class="container-fluid"> 
            <div class="d-flex flex-wrap align-items-center justify-content-center justify-content-lg-start"> 
              
              <a href="/" class="d-flex align-items-center mb-2 mb-lg-0 link-body-emphasis text-decoration-none"> 
                <svg class="bi me-2" width="40" height="32" role="img" aria-label="Bootstrap">
                  <use xlink:href="#bootstrap"></use>
                </svg> 
              </a> 

              <ul class="nav col-12 col-lg-auto me-lg-auto mb-2 justify-content-center mb-md-0"> 
                
                <li><a href="#"class="nav-link px-2 link-secondary" :class="{ active: view==='appointments' }" @click="go('appointments')">📅 Citas</a></li> 
                <li><a href="#" class="nav-link px-2 link-body-emphasis" :class="{ active: view==='history' }" @click="go('history')">🕘 Historial</a></li> 
                <li><a href="#" class="nav-link px-2 link-body-emphasis" :class="{ active: view==='patient' }" @click="go('patient')">👥 Pacientes</a></li>
                <li><a href="#" class="nav-link px-2 link-body-emphasis" :class="{ active: view==='users' }" @click="go('users')">👥 Equipos</a></li> 
                <li><a href="#" class="nav-link px-2 link-body-emphasis" :class="{ active: view==='settings' }" @click="go('settings')">⚙️ Ajustes</a></li> 
                <li><a href="#" class="nav-link px-2 link-body-emphasis" :class="{ active: view==='audit' }" @click="go('audit')">🧾 Auditoría</a></li> 

              </ul> 
              
              <form class="col-12 col-lg-auto mb-3 mb-lg-0 me-lg-3" role="search"> 
                <input type="search" class="form-control" placeholder="Search..." aria-label="Search"> 
              </form> <div class="dropdown text-end"> 
              
              <a href="#" class="d-block link-body-emphasis text-decoration-none dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false"> 
                <img src="https://github.com/mdo.png" alt="mdo" width="32" height="32" class="rounded-circle"> 
              </a> 

              <ul class="dropdown-menu text-small"> 
                <li><a class="dropdown-item" href="#">New project...</a></li> 
                <li><a class="dropdown-item" href="#">Settings</a></li> 
                <li><a class="dropdown-item" href="#">Profile</a></li> 
                <li><hr class="dropdown-divider"></li> 
                <li><a class="dropdown-item" href="#" @click="logout">Cerrar sesión</a></li> 
              </ul> 

            </div>
          </div>
        </header>
      
      </div>
    </div>
    <div class="row">
      <div class="col col-2">SideBar (Pendiente)</div>
      <div class="col col-10">

        <div class="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h1 class="h3 mb-1">WebApp Citas</h1>
            <div class="text-muted">Admin panel (login + usuarios)</div>
          </div>
          <button v-if="user" class="btn btn-outline-danger" @click="logout">Cerrar sesión</button>
        </div>

        <!------------------------------>
        <!-- start: Login form -->
        <!------------------------------>
        <div v-if="!user" class="card shadow-sm" style="max-width:520px;">
          <div class="card-body">
            <div v-if="errorMsg" class="alert alert-danger">{{ errorMsg }}</div>

            <div class="mb-3">
              <label class="form-label">Email</label>
              <input class="form-control" v-model="email" autocomplete="username" />
            </div>

            <div class="mb-3">
              <label class="form-label">Password</label>
              <input class="form-control" type="password" v-model="password" autocomplete="current-password" />
            </div>

            <button class="btn btn-primary w-100" :disabled="loading" @click="login">
              {{ loading ? "Ingresando..." : "Ingresar" }}
            </button>
          </div>
        </div>
        <!------------------------------>
        <!--- end: Login form --->
        <!------------------------------>

        <!-- Panel -->
        <div v-else>

          <!-------------------->
          <!-- start: Submenu -->
          <!-------------------->
          <ul class="nav nav-tabs mb-4">

            <li class="nav-item">
              <button class="nav-link" :class="{ active: view==='appointments' }" @click="go('appointments')">
                📅 Citas
              </button>
            </li>

            <li class="nav-item">
              <button class="nav-link" :class="{ active: view==='history' }" @click="go('history')">
                🕘 Historial
              </button>
            </li>

            <li class="nav-item" v-if="isAdmin">
              <button class="nav-link" :class="{ active: view==='users' }" @click="go('users')">
                👥 Usuarios
              </button>
            </li>

            <li class="nav-item">
              <button class="nav-link" :class="{ active: view==='settings' }" @click="go('settings')">
                ⚙️ Ajustes
              </button>
            </li>

            <li class="nav-item" v-if="canAudit">
              <button class="nav-link" :class="{ active: view==='audit' }" @click="go('audit')">
                🧾 Auditoría
              </button>
            </li>
          </ul>
          <!-------------------->
          <!--- end: Submenu --->
          <!-------------------->

          <!------------------------------>
          <!-- start: ✅ Users is Admin -->
          <!------------------------------>
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


            <!-- ✅ Usuarios: SOLO admin -->

            <div class="card shadow-sm mb-4">

              <div class="card-header d-flex justify-content-between align-items-center">
                <div class="fw-semibold">Usuarios</div>
              </div>

              <div class="table-responsive">

                <table class="table table-striped mb-0 table-hover">
                  <thead>
                    <tr>
                      <th>ID</th><th>Nombre</th><th>Email</th><th>Rol</th><th>Status</th><th>Acciones</th>
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
          <!------------------------------>
          <!--- end: ✅ Users is Admin --->
          <!------------------------------>
          
          <!--------------------->
          <!-- start: ✅ Citas -->
          <!--------------------->

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
          <!--------------------->
          <!--- end: ✅ Citas --->
          <!--------------------->

          <div v-if="view==='patient'" class="card shadow-sm mb-4">
            <div class="card-header">

              <div class="d-flex justify-content-between align-items-center">
                <h2 class="h5 mb-2">Gestion de usuarios</h2>
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
          

        




          <!-- ✅ Modal New Users (NECESARIO para que el botón funcione) -->

          <div class="modal fade" id="userModal" tabindex="-1" aria-hidden="true">
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
          <!-- ✅ End Modal New Users -->

        </div>
      
      </div>
    </div>

    
  </div>
  `,
}).mount("#app");
