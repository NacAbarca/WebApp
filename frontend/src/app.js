import { api } from "./services/api.js";

const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    // ===== AUTH STATE =====
    const email = ref("admin@local.test");
    const password = ref("Admin123!");
    const user = ref(null);
    const errorMsg = ref("");
    const loading = ref(false);

    // ===== AUTH ACTIONS =====
    async function loadMe() {
      try {
        user.value = (await api("path=auth&action=me")).user;
      } catch {
        user.value = null; // normal si no hay sesión
      }
    }

    async function login() {
      errorMsg.value = "";
      loading.value = true;

      try {
        const data = await api("path=auth&action=login", {
          method: "POST",
          body: { email: email.value, password: password.value }
        });

        user.value = data.user;

        // ✅ CLAVE: cargar usuarios al iniciar sesión
        await loadUsers();
        await loadAppointments();

      } catch (e) {
        errorMsg.value = e.message;
      } finally {
        loading.value = false;
      }
    }

    const users = ref([]);
    const form = ref({ id: null, name: "", email: "", role: "user", status: "active", password: "" });
    let modal = null;

    async function loadUsers() {
      errorMsg.value = "";
      try {
        const data = await api("path=users");
        users.value = data.users;
      } catch (e) {
        errorMsg.value = e.message;
      }
    }

    function openCreate() {
      form.value = { id: null, name: "", email: "", role: "user", status: "active", password: "" };
      modal?.show();
    }

    function openEdit(u) {
      form.value = { id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, password: "" };
      modal?.show();
    }

    async function saveUser() {
      errorMsg.value = "";
      try {
        if (!form.value.name) throw new Error("Nombre requerido");

        if (!form.value.id) {
          await api("path=users", { method: "POST", body: form.value });
        } else {
          await api(`path=users&id=${form.value.id}`, { method: "PUT", body: form.value });
        }

        modal?.hide();
        await loadUsers();
      } catch (e) {
        errorMsg.value = e.message;
      }
    }

    async function deactivate(u) {
      if (!confirm(`Desactivar usuario ${u.email}?`)) return;
      try {
        await api(`path=users&id=${u.id}`, { method: "DELETE" });
        await loadUsers();
      } catch (e) {
        errorMsg.value = e.message;
      }
    }

    async function logout() {
      errorMsg.value = "";
      try {
        await api("path=auth&action=logout", { method: "POST", body: {} });
      } finally {
        user.value = null;
        users.value = [];
      }
    }

    // ===== APPOINTMENTS STATE =====
    const appointments = ref([]);
    const apptError = ref("");

    const apptForm = ref({
      user_id: 1,
      start_at: "",
      end_at: "",
      notes: ""
    });

    async function loadAppointments() {
      apptError.value = "";
      try {
        const data = await api("path=appointments&from=2026-01-01&to=2026-12-31");
        appointments.value = data.appointments || [];
      } catch (e) {
        apptError.value = e.message;
        appointments.value = [];
      }
    }

    async function createAppointment() {
      apptError.value = "";
      try {
        if (!apptForm.value.start_at || !apptForm.value.end_at) {
          throw new Error("Completa start_at y end_at");
        }
        await api("path=appointments", { method: "POST", body: apptForm.value });
        await loadAppointments();
      } catch (e) {
        apptError.value = e.message;
      }
    }

    async function setAppointmentStatus(a, status) {
      apptError.value = "";
      try {
        await api(`path=appointments&id=${a.id}`, { method: "PUT", body: { status } });
        await loadAppointments();
      } catch (e) {
        apptError.value = e.message;
      }
    }

    async function cancelAppointment(a) {
      apptError.value = "";
      try {
        await api(`path=appointments&id=${a.id}`, { method: "DELETE", body: {} });
        await loadAppointments();
      } catch (e) {
        apptError.value = e.message;
      }
    }

    onMounted(async () => {
      await loadMe();

      const modalEl = document.getElementById("userModal");
      if (modalEl && window.bootstrap) {
        modal = new window.bootstrap.Modal(modalEl);

        modalEl.addEventListener("hidden.bs.modal", () => {
          if (document.activeElement) document.activeElement.blur();
        });
      }

      if (user.value) await loadUsers();
      if (user.value) await loadAppointments();

    });



    return {
      email, password, user, errorMsg, loading, login, logout,
      users, form, loadUsers, openCreate, openEdit, saveUser, deactivate,

      // citas
      appointments, apptForm, apptError,
      loadAppointments, createAppointment, setAppointmentStatus, cancelAppointment
    };
  },

  template: `
  <div class="container py-5" style="max-width: 980px;">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="h3 mb-1">WebApp Citas</h1>
        <div class="text-muted">Admin panel (login + usuarios)</div>
      </div>
      <button v-if="user" class="btn btn-outline-danger" @click="logout">
        Cerrar sesión
      </button>
    </div>

    <!-- ================= LOGIN ================= -->
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

    <!-- ================= PANEL ================= -->
    <div v-else>

      <!-- Sesión -->
      <div class="alert alert-success d-flex justify-content-between align-items-center">
        <div>
          ✅ Sesión activa —
          <b>{{ user.email }}</b> ({{ user.role }})
        </div>
        <button class="btn btn-sm btn-success" @click="openCreate">
          + Nuevo usuario
        </button>
      </div>

      <div v-if="errorMsg" class="alert alert-danger">{{ errorMsg }}</div>

      <!-- ================= USUARIOS ================= -->
      <div class="card shadow-sm mb-4">
        <div class="table-responsive">
          <table class="table table-striped mb-0">
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
                <td>
                  <span class="badge text-bg-secondary">{{ u.role }}</span>
                </td>
                <td>
                  <span
                    class="badge"
                    :class="u.status === 'active' ? 'text-bg-success' : 'text-bg-warning'"
                  >
                    {{ u.status }}
                  </span>
                </td>
                <td class="d-flex gap-2">
                  <button class="btn btn-sm btn-outline-primary" @click="openEdit(u)">
                    Editar
                  </button>
                  <button class="btn btn-sm btn-outline-danger" @click="deactivate(u)">
                    Desactivar
                  </button>
                </td>
              </tr>
              <tr v-if="users.length === 0">
                <td colspan="6" class="text-muted p-4">Sin usuarios</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ================= MODAL USUARIO ================= -->
      <div class="modal fade" id="userModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">
                {{ form.id ? 'Editar usuario' : 'Nuevo usuario' }}
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>

            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">Nombre</label>
                <input class="form-control" v-model="form.name" />
              </div>

              <div class="mb-3" v-if="!form.id">
                <label class="form-label">Email</label>
                <input class="form-control" v-model="form.email" />
              </div>

              <div class="mb-3">
                <label class="form-label">Rol</label>
                <select class="form-select" v-model="form.role">
                  <option value="admin">admin</option>
                  <option value="staff">staff</option>
                  <option value="user">user</option>
                </select>
              </div>

              <div class="mb-3">
                <label class="form-label">Status</label>
                <select class="form-select" v-model="form.status">
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              </div>

              <div class="mb-3">
                <label class="form-label">
                  {{ form.id ? 'Nueva password (opcional)' : 'Password' }}
                </label>
                <input class="form-control" type="password" v-model="form.password" />
              </div>
            </div>

            <div class="modal-footer">
              <button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button class="btn btn-primary" @click="saveUser">Guardar</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ================= CITAS ================= -->
      <hr class="my-4"/>

      <div class="d-flex justify-content-between align-items-center mb-2">
        <h2 class="h5 mb-0">Citas</h2>
        <button class="btn btn-sm btn-outline-secondary" @click="loadAppointments">
          Refrescar
        </button>
      </div>

      <div v-if="apptError" class="alert alert-danger">{{ apptError }}</div>

      <div class="card shadow-sm mb-3">
        <div class="card-body">
          <div class="row g-2 align-items-end">
            <div class="col-md-2">
              <label class="form-label">User ID</label>
              <input class="form-control" v-model="apptForm.user_id" type="number" min="1" />
            </div>
            <div class="col-md-3">
              <label class="form-label">Start</label>
              <input class="form-control" v-model="apptForm.start_at" placeholder="2026-01-15 10:00:00" />
            </div>
            <div class="col-md-3">
              <label class="form-label">End</label>
              <input class="form-control" v-model="apptForm.end_at" placeholder="2026-01-15 10:30:00" />
            </div>
            <div class="col-md-3">
              <label class="form-label">Notas</label>
              <input class="form-control" v-model="apptForm.notes" />
            </div>
            <div class="col-md-1 d-grid">
              <button class="btn btn-success" @click="createAppointment">
                Crear
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="card shadow-sm">
        <div class="table-responsive">
          <table class="table table-striped mb-0">
            <thead>
              <tr>
                <th>ID</th>
                <th>Usuario</th>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in appointments" :key="a.id">
                <td>{{ a.id }}</td>
                <td>
                  <div class="fw-semibold">{{ a.user_name }}</div>
                  <div class="text-muted small">{{ a.user_email }}</div>
                </td>
                <td>{{ a.start_at }}</td>
                <td>{{ a.end_at }}</td>
                <td>
                  <span class="badge text-bg-info">{{ a.status }}</span>
                </td>
                <td class="d-flex flex-wrap gap-2">
                  <button class="btn btn-sm btn-outline-primary" @click="setAppointmentStatus(a,'confirmed')">
                    Confirmar
                  </button>
                  <button class="btn btn-sm btn-outline-success" @click="setAppointmentStatus(a,'done')">
                    Done
                  </button>
                  <button class="btn btn-sm btn-outline-warning" @click="setAppointmentStatus(a,'no_show')">
                    No-show
                  </button>
                  <button class="btn btn-sm btn-outline-danger" @click="cancelAppointment(a)">
                    Cancelar
                  </button>
                </td>
              </tr>
              <tr v-if="appointments.length === 0">
                <td colspan="6" class="text-muted p-4">
                  Sin citas (crea la primera arriba)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div> <!-- cierre v-else -->
  </div>   <!-- cierre container -->
`
}).mount("#app");
