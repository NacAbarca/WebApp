// frontend/src/app.js
import { api } from "./services/api.js";

const { createApp, ref, computed, onMounted, watch } = Vue;

createApp({
  setup() {
    // -------- Auth
    const email = ref("");
    const password = ref("");
    const user = ref(null);
    const loading = ref(false);
    const errorMsg = ref("");

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
      users.value = [];
      appointments.value = [];
    }

    // -------- Users
    const users = ref([]);
    const form = ref({
      id: null,
      name: "",
      email: "",
      role: "user",
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

    // Permisos: admin puede crear para cualquiera; staff/user solo para sí mismo.
    const createDisabledReason = computed(() => {
      if (!user.value) return "Debes iniciar sesión";
      if (!apptForm.value.user_id) return "Selecciona un usuario";

      const selectedId = Number(apptForm.value.user_id);
      const meId = Number(user.value.id);

      if (user.value.role === "admin") return "";
      if (selectedId !== meId) return "No tienes permiso para crear citas para otros usuarios";
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

      // UX pro: si no puede, NO hacemos request, solo tooltip
      if (!canCreateAppointment.value) return;

      try {
        await api(
          { path: "appointments" },
          {
            method: "POST",
            body: {
              user_id: Number(apptForm.value.user_id),
              start_at: apptForm.value.start_at,
              end_at: apptForm.value.end_at,
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
      openCreate, openEdit, saveUser, deactivate,

      // appts
      appointments, apptError, apptForm,
      selectableUsers,
      canCreateAppointment, createDisabledReason,
      loadAppointments: loadAppointmentsSafe,
      createAppointment,
      setAppointmentStatus,
      cancelAppointment,
    };
  },

    template: `
  <div class="container py-5" style="max-width: 980px;">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="h3 mb-1">WebApp Citas</h1>
        <div class="text-muted">Admin panel (login + usuarios)</div>
      </div>
      <button v-if="user" class="btn btn-outline-danger" @click="logout">Cerrar sesión</button>
    </div>

    <!-- Login -->
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

    <!-- Panel -->
    <div v-else>
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

      <div v-if="errorMsg" class="alert alert-danger">{{ errorMsg }}</div>

      <!-- ✅ Usuarios: SOLO admin -->

      <div class="card shadow-sm mb-4">
        <div class="card-header d-flex justify-content-between align-items-center">
          <div class="fw-semibold">Usuarios</div>
          <button class="btn btn-sm btn-outline-secondary" @click="loadUsersSafe">Refrescar</button>
        </div>

        <div class="table-responsive">
          <table class="table table-striped mb-0">
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
                  <span
                    class="d-inline-block"
                    tabindex="0"
                    data-bs-toggle="tooltip"
                    :data-bs-title="canManageUsers ? 'Editar' : 'No se permite: autorizado por rol'"
                  >
                    <button class="btn btn-sm btn-outline-primary" :disabled="!canManageUsers" @click="openEdit(u)">
                      Editar
                    </button>
                  </span>

                  <span
                    class="d-inline-block"
                    tabindex="0"
                    data-bs-toggle="tooltip"
                    :data-bs-title="canManageUsers ? 'Desactivar' : 'No se permite: autorizado por rol'"
                  >
                    <button class="btn btn-sm btn-outline-danger" :disabled="!canManageUsers" @click="deactivate(u)">
                      Desactivar
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
      </div>

      <!-- ✅ Citas -->
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h2 class="h5 mb-0">Citas</h2>
        <button class="btn btn-sm btn-outline-secondary" @click="loadAppointments">Refrescar</button>
      </div>

      <div v-if="apptError" class="alert alert-danger">{{ apptError }}</div>

      <div class="card shadow-sm mb-3">
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
              <label class="form-label">Start (YYYY-MM-DD HH:MM:SS)</label>
              <input class="form-control" v-model="apptForm.start_at" placeholder="2026-01-15 10:00:00" />
            </div>

            <div class="col-md-3">
              <label class="form-label">End (YYYY-MM-DD HH:MM:SS)</label>
              <input class="form-control" v-model="apptForm.end_at" placeholder="2026-01-15 10:30:00" />
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
        </div>
      </div>

      <div class="card shadow-sm">
        <div class="table-responsive">
          <table class="table table-striped mb-0">
            <thead>
              <tr>
                <th>ID</th><th>Usuario</th><th>Start</th><th>End</th><th>Status</th><th>Acciones</th>
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
      </div>

      <!-- ✅ Modal Users (NECESARIO para que el botón funcione) -->
      <div class="modal fade" id="userModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">{{ form.id ? 'Editar usuario' : 'Nuevo usuario' }}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
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
                <label class="form-label">{{ form.id ? 'Nueva password (opcional)' : 'Password' }}</label>
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

    </div>
  </div>
  `,
}).mount("#app");
