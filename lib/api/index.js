import { createRouter } from './http'
import { registerCustomerRoutes } from './customer'
import { registerAdminRoutes } from './admin'
import { registerPlatformRoutes } from './platform'

export const router = createRouter()
router.get('/health', async () => ({ ok: true, time: new Date() }), { noTenant: true })
registerCustomerRoutes(router)
registerAdminRoutes(router)
registerPlatformRoutes(router)
