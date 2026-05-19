import { Injectable, BadRequestException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import {
  RoleListQueryDto,
  AddRoleDto,
  EditRoleDto,
  DeleteRoleDto,
  UserPermissionListQueryDto,
  BindRoleDto,
  ClearRoleDto,
  SaveRoleMenuDto,
  SaveDataScopeDto,
  SaveRolePagePermDto,
  PermissionLogQueryDto,
} from './permission.dto';

@Injectable()
export class PermissionService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.initDefaultData();
  }

  // ========== 角色管理 ==========
  async getRoleList(query: RoleListQueryDto) {
    const { pageNum = 1, pageSize = 20, keyword } = query;
    const skip = (pageNum - 1) * pageSize;

    const where = keyword
      ? {
          OR: [
            { roleName: { contains: keyword, mode: 'insensitive' as const } },
            { roleDesc: { contains: keyword, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [roles, total] = await Promise.all([
      this.prisma.sysRole.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createTime: 'desc' },
        include: {
          _count: {
            select: { userRoles: true },
          },
        },
      }),
      this.prisma.sysRole.count({ where }),
    ]);

    return {
      list: roles.map((r) => ({
        roleId: r.roleId,
        roleName: r.roleName,
        roleDesc: r.roleDesc,
        status: r.status,
        createTime: r.createTime,
        userCount: r._count.userRoles,
      })),
      total,
      pageNum,
      pageSize,
    };
  }

  async addRole(dto: AddRoleDto) {
    const role = await this.prisma.sysRole.create({
      data: {
        roleName: dto.roleName,
        roleDesc: dto.roleDesc,
        status: dto.status ?? 1,
      },
    });
    await this.logPermission('system', 'add', null, `新增角色: ${dto.roleName}`, '新增角色');
    return role;
  }

  async editRole(dto: EditRoleDto) {
    const role = await this.prisma.sysRole.update({
      where: { roleId: BigInt(dto.roleId) },
      data: {
        roleName: dto.roleName,
        roleDesc: dto.roleDesc,
        status: dto.status,
      },
    });
    await this.logPermission('system', 'edit', null, `编辑角色: ${dto.roleName}`, '编辑角色');
    return role;
  }

  async deleteRole(dto: DeleteRoleDto) {
    // 检查是否有关联用户
    const userCount = await this.prisma.sysUserRole.count({
      where: { roleId: BigInt(dto.roleId) },
    });

    if (userCount > 0) {
      throw new BadRequestException('该角色已绑定用户，无法删除');
    }

    await this.prisma.sysRole.delete({
      where: { roleId: BigInt(dto.roleId) },
    });

    await this.logPermission('system', 'delete', null, `删除角色ID: ${dto.roleId}`, '删除角色');
    return { success: true };
  }

  async getRoleUsers(roleId: number) {
    const userRoles = await this.prisma.sysUserRole.findMany({
      where: { roleId: BigInt(roleId) },
      include: {
        role: true,
      },
    });

    // 获取关联的员工信息
    const userIds = userRoles.map((ur) => ur.userId);
    const employees = await this.prisma.wecomEmployee.findMany({
      where: { userId: { in: userIds } },
    });

    return employees.map((emp) => ({
      userId: emp.userId,
      name: emp.name,
      department: emp.department,
      position: emp.position,
    }));
  }

  // ========== 用户权限分配 ==========
  async getUserPermissionList(query: UserPermissionListQueryDto) {
    const { pageNum = 1, pageSize = 20, keyword } = query;
    const skip = (pageNum - 1) * pageSize;

    const where = keyword
      ? {
          OR: [
            { name: { contains: keyword, mode: 'insensitive' as const } },
            { userId: { contains: keyword, mode: 'insensitive' as const } },
            { department: { contains: keyword, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [employees, total] = await Promise.all([
      this.prisma.wecomEmployee.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.wecomEmployee.count({ where }),
    ]);

    // 获取用户角色和数据权限
    const userIds = employees.map((e) => e.userId);
    const userRoles = await this.prisma.sysUserRole.findMany({
      where: { userId: { in: userIds } },
      include: { role: true },
    });

    const dataScopes = await this.prisma.sysUserDataScope.findMany({
      where: { userId: { in: userIds } },
    });

    const userRoleMap = new Map<string, any[]>();
    for (const ur of userRoles) {
      if (!userRoleMap.has(ur.userId)) {
        userRoleMap.set(ur.userId, []);
      }
      userRoleMap.get(ur.userId)!.push({ roleId: ur.role.roleId, roleName: ur.role.roleName });
    }

    const dataScopeMap = new Map<string, number>();
    for (const ds of dataScopes) {
      dataScopeMap.set(ds.userId, ds.dataScope);
    }

    return {
      list: employees.map((emp) => ({
        userId: emp.userId,
        name: emp.name,
        department: emp.department,
        position: emp.position,
        mobile: emp.mobile,
        enabled: emp.enabled,
        isCustomerService: emp.isCustomerService,
        roles: userRoleMap.get(emp.userId) || [],
        dataScope: dataScopeMap.get(emp.userId) || 1,
      })),
      total,
      pageNum,
      pageSize,
    };
  }

  async bindUserRoles(dto: BindRoleDto) {
    // 先删除现有角色
    await this.prisma.sysUserRole.deleteMany({
      where: { userId: dto.userId },
    });

    // 绑定新角色
    if (dto.roleIds.length > 0) {
      await this.prisma.sysUserRole.createMany({
        data: dto.roleIds.map((roleId) => ({
          userId: dto.userId,
          roleId: BigInt(roleId),
        })),
      });
    }

    await this.logPermission(
      'system',
      'bind',
      dto.userId,
      `绑定角色: ${dto.roleIds.join(', ')}`,
      '绑定角色',
    );
    return { success: true };
  }

  async clearUserRoles(dto: ClearRoleDto) {
    const beforeRoles = await this.prisma.sysUserRole.findMany({
      where: { userId: dto.userId },
      include: { role: true },
    });

    await this.prisma.sysUserRole.deleteMany({
      where: { userId: dto.userId },
    });

    await this.logPermission(
      'system',
      'clear',
      dto.userId,
      `清空角色: ${beforeRoles.map((r) => r.role.roleName).join(', ')}`,
      '清空角色',
    );
    return { success: true };
  }

  async getUserAuthDetail(userId: string) {
    const userRoles = await this.prisma.sysUserRole.findMany({
      where: { userId },
      include: { role: true },
    });

    const roleIds = userRoles.map((ur) => ur.roleId);
    const roleMenus = await this.prisma.sysRoleMenu.findMany({
      where: { roleId: { in: roleIds } },
      include: { role: true },
    });

    const menuIds = [...new Set(roleMenus.map((rm) => rm.menuId.toString()))];
    const menus = await this.prisma.sysMenu.findMany({
      where: { id: { in: menuIds.map((id) => BigInt(id)) } },
    });

    const dataScope = await this.prisma.sysUserDataScope.findUnique({
      where: { userId },
    });

    return {
      roles: userRoles.map((ur) => ({ roleId: ur.role.roleId, roleName: ur.role.roleName })),
      menus: menus.map((m) => ({
        menuId: m.id,
        menuName: m.menuName,
        menuType: m.menuType,
        path: m.path,
      })),
      dataScope: dataScope?.dataScope || 1,
    };
  }

  // ========== 菜单权限 ==========
  async getMenuTree() {
    const menus = await this.prisma.sysMenu.findMany({
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }],
    });

    return this.buildMenuTree(menus, 0);
  }

  private buildMenuTree(menus: any[], parentId: number): any[] {
    return menus
      .filter((m) => Number(m.parentId) === parentId)
      .map((m) => ({
        id: m.id,
        parentId: m.parentId,
        menuName: m.menuName,
        menuType: m.menuType,
        path: m.path,
        component: m.component,
        icon: m.icon,
        sortOrder: m.sortOrder,
        children: this.buildMenuTree(menus, Number(m.id)),
      }));
  }

  async getRoleMenus(roleId: number) {
    const roleMenus = await this.prisma.sysRoleMenu.findMany({
      where: { roleId: BigInt(roleId) },
    });

    return roleMenus.map((rm) => ({
      menuId: rm.menuId,
      buttonAuth: rm.buttonAuth,
    }));
  }

  async saveRoleMenus(dto: SaveRoleMenuDto) {
    // 先删除现有菜单权限
    await this.prisma.sysRoleMenu.deleteMany({
      where: { roleId: BigInt(dto.roleId) },
    });

    // 创建新权限
    if (dto.menuIds.length > 0) {
      await this.prisma.sysRoleMenu.createMany({
        data: dto.menuIds.map((menuId) => ({
          roleId: BigInt(dto.roleId),
          menuId: BigInt(menuId),
          buttonAuth: dto.buttonAuth,
        })),
      });
    }

    await this.logPermission('system', 'menu', null, `配置角色菜单权限: ${dto.roleId}`, '菜单权限配置');
    return { success: true };
  }

  // ========== 页面权限 ==========
  async getRolePagePerms(roleId: number) {
    const perms = await this.prisma.sysRolePagePerm.findMany({
      where: { roleId: BigInt(roleId) },
    });

    return perms.map((p) => ({
      pagePath: p.pagePath,
      canView: p.canView,
      canOp: p.canOp,
    }));
  }

  async saveRolePagePerms(dto: SaveRolePagePermDto) {
    // 先删除现有页面权限
    await this.prisma.sysRolePagePerm.deleteMany({
      where: { roleId: BigInt(dto.roleId) },
    });

    // 创建新权限
    if (dto.perms.length > 0) {
      await this.prisma.sysRolePagePerm.createMany({
        data: dto.perms.map((p) => ({
          roleId: BigInt(dto.roleId),
          pagePath: p.pagePath,
          canView: p.canView,
          canOp: p.canOp,
        })),
      });
    }

    await this.logPermission('system', 'page-perm', null, `配置角色页面权限: ${dto.roleId}`, '页面权限配置');
    return { success: true };
  }

  // ========== 数据权限 ==========
  async saveDataScope(dto: SaveDataScopeDto) {
    const existing = await this.prisma.sysUserDataScope.findUnique({
      where: { userId: dto.userId },
    });

    const scopeName = { 1: '个人', 2: '部门', 3: '全部' }[dto.dataScope] || '个人';

    if (existing) {
      await this.prisma.sysUserDataScope.update({
        where: { userId: dto.userId },
        data: { dataScope: dto.dataScope },
      });
    } else {
      await this.prisma.sysUserDataScope.create({
        data: {
          userId: dto.userId,
          dataScope: dto.dataScope,
        },
      });
    }

    await this.logPermission('system', 'scope', dto.userId, `设置数据权限: ${scopeName}`, '数据权限配置');
    return { success: true };
  }

  async getUserDataScope(userId: string) {
    const scope = await this.prisma.sysUserDataScope.findUnique({
      where: { userId },
    });
    return { dataScope: scope?.dataScope || 1 };
  }

  // ========== 权限日志 ==========
  async getPermissionLogs(query: PermissionLogQueryDto) {
    const { pageNum = 1, pageSize = 20, operator, targetUser, operateType, startTime, endTime } = query;
    const skip = (pageNum - 1) * pageSize;

    const where: any = {};
    if (operator) where.operator = { contains: operator, mode: 'insensitive' };
    if (targetUser) where.targetUser = { contains: targetUser, mode: 'insensitive' };
    if (operateType) where.operateType = operateType;
    if (startTime || endTime) {
      where.operateTime = {};
      if (startTime) where.operateTime.gte = new Date(startTime);
      if (endTime) where.operateTime.lte = new Date(endTime);
    }

    const [logs, total] = await Promise.all([
      this.prisma.sysPermissionLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { operateTime: 'desc' },
      }),
      this.prisma.sysPermissionLog.count({ where }),
    ]);

    return {
      list: logs.map((log) => ({
        logId: log.logId,
        operator: log.operator,
        operateTime: log.operateTime,
        operateIp: log.operateIp,
        targetUser: log.targetUser,
        beforeAuth: log.beforeAuth,
        afterAuth: log.afterAuth,
        operateType: log.operateType,
      })),
      total,
      pageNum,
      pageSize,
    };
  }

  async exportPermissionLogs(query: PermissionLogQueryDto) {
    const logs = await this.getPermissionLogs({ ...query, pageNum: 1, pageSize: 10000 });
    return logs.list;
  }

  // ========== 内部方法 ==========
  private async logPermission(
    operator: string,
    operateType: string,
    targetUser: string | null,
    afterAuth: string,
    type: string,
  ) {
    await this.prisma.sysPermissionLog.create({
      data: {
        operator,
        operateType: type,
        targetUser: targetUser || '',
        afterAuth,
        operateIp: '127.0.0.1',
      },
    });
  }

  // 初始化系统预设角色和菜单
  async initDefaultData() {
    // 检查是否已初始化
    const existingMenus = await this.prisma.sysMenu.count();
    if (existingMenus > 0) return;

    // 创建系统菜单
    const menuData = [
      { menuName: '客服运营后台', path: '/', component: 'DashboardPage', icon: 'HomeOutlined', sortOrder: 1 },
      { menuName: '用户满意度', path: '/satisfaction', component: 'DashboardPage', icon: 'SmileOutlined', sortOrder: 2 },
      { menuName: 'Udesk 数据分析', path: '/udesk', component: 'udesk', icon: 'DashboardOutlined', sortOrder: 3, isParent: true },
      { menuName: '评价分析', path: '/udesk/votes', component: 'VotesPage', parentPath: '/udesk', sortOrder: 31 },
      { menuName: '会话指标', path: '/udesk/metrics', component: 'MetricsPage', parentPath: '/udesk', sortOrder: 32 },
      { menuName: '咨询详情', path: '/udesk/sessions', component: 'SessionDetailPage', parentPath: '/udesk', sortOrder: 33 },
      { menuName: '需求关单率', path: '/demand', component: 'demand', icon: 'CheckCircleOutlined', sortOrder: 4, isParent: true },
      { menuName: '汇总 Dashboard', path: '/demand', component: 'DemandSummaryPage', parentPath: '/demand', sortOrder: 41 },
      { menuName: '需求详情', path: '/demand/requirements', component: 'RequirementDetailPage', parentPath: '/demand', sortOrder: 42 },
      { menuName: 'Bug 详情', path: '/demand/bugs', component: 'BugDetailPage', parentPath: '/demand', sortOrder: 43 },
      { menuName: '商机管理', path: '/opportunity', component: 'OpportunityPage', icon: 'DollarOutlined', sortOrder: 5 },
      { menuName: '数据同步（Udesk）', path: '/sync-udesk', component: 'SyncPage', icon: 'SyncOutlined', sortOrder: 6 },
      { menuName: '数据同步（驺吾）', path: '/sync-zouwu', component: 'SyncPage', icon: 'SyncOutlined', sortOrder: 7 },
      { menuName: '人员管理', path: '/users', component: 'UsersPage', icon: 'TeamOutlined', sortOrder: 8 },
      { menuName: '系统日志', path: '/logs', component: 'LogsPage', icon: 'FileTextOutlined', sortOrder: 9 },
      { menuName: '权限管理', path: '/access-control', component: 'AccessControlPage', icon: 'SafetyOutlined', sortOrder: 10 },
      { menuName: '角色管理', path: '/role-manage', component: 'RoleManagePage', icon: 'SafetyOutlined', sortOrder: 11 },
    ];

    for (const m of menuData) {
      await this.prisma.sysMenu.create({
        data: {
          menuName: m.menuName,
          path: m.path,
          component: m.component,
          icon: m.icon,
          sortOrder: m.sortOrder,
          menuType: (m as any).isParent ? 1 : 2,
          parentId: (m as any).parentPath ? BigInt(0) : BigInt(0), // 简化处理
        },
      });
    }

    // 创建预设角色
    const roles = [
      { roleName: '超级管理员', roleDesc: '全菜单、全按钮、全业务数据权限' },
      { roleName: '运营管理员', roleDesc: '运营数据、人员查看权限，无高危删除权限' },
      { roleName: '质检专员', roleDesc: '满意度、会话数据查看权限，无人员编辑权限' },
      { roleName: '普通客服', roleDesc: '仅本人个人业务数据查看权限' },
    ];

    for (const r of roles) {
      await this.prisma.sysRole.create({ data: r });
    }
  }
}