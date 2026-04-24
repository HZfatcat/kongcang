import { apiClient } from './client';

// ========== 角色管理 ==========
export interface RoleItem {
  roleId: number;
  roleName: string;
  roleDesc?: string;
  status: number;
  createTime: string;
  userCount: number;
}

export interface RoleListResponse {
  list: RoleItem[];
  total: number;
  pageNum: number;
  pageSize: number;
}

export async function fetchRoleList(params: { pageNum?: number; pageSize?: number; keyword?: string }) {
  const res = await apiClient.get<RoleListResponse>('/role/list', { params });
  return res.data;
}

export async function addRole(data: { roleName: string; roleDesc?: string; status?: number }) {
  const res = await apiClient.post('/role/add', data);
  return res.data;
}

export async function editRole(data: { roleId: number; roleName: string; roleDesc?: string; status?: number }) {
  const res = await apiClient.post('/role/edit', data);
  return res.data;
}

export async function deleteRole(roleId: number) {
  const res = await apiClient.post('/role/delete', { roleId });
  return res.data;
}

export async function fetchRoleUsers(roleId: number) {
  const res = await apiClient.get('/role/userList', { params: { roleId } });
  return res.data;
}

// ========== 用户权限分配 ==========
export interface UserPermission {
  userId: string;
  name?: string;
  department?: string;
  position?: string;
  mobile?: string;
  enabled: boolean;
  isCustomerService: boolean;
  roles: { roleId: number; roleName: string }[];
  dataScope: number;
}

export interface UserPermissionListResponse {
  list: UserPermission[];
  total: number;
  pageNum: number;
  pageSize: number;
}

export async function fetchUserPermissionList(params: { pageNum?: number; pageSize?: number; keyword?: string }) {
  const res = await apiClient.get<UserPermissionListResponse>('/user/permission/list', { params });
  return res.data;
}

export async function bindUserRoles(userId: string, roleIds: number[]) {
  const res = await apiClient.post('/user/role/bind', { userId, roleIds });
  return res.data;
}

export async function clearUserRoles(userId: string) {
  const res = await apiClient.post('/user/role/clear', { userId });
  return res.data;
}

export async function fetchUserAuthDetail(userId: string) {
  const res = await apiClient.get('/user/auth/view', { params: { userId } });
  return res.data;
}

// ========== 菜单权限 ==========
export interface MenuTreeItem {
  id: number;
  parentId: number;
  menuName: string;
  menuType: number;
  path?: string;
  component?: string;
  icon?: string;
  sortOrder: number;
  children?: MenuTreeItem[];
}

export async function fetchMenuTree() {
  const res = await apiClient.get<MenuTreeItem[]>('/menu/tree');
  return res.data;
}

export async function fetchRoleMenus(roleId: number) {
  const res = await apiClient.get('/role/menu/get', { params: { roleId } });
  return res.data;
}

export async function saveRoleMenus(roleId: number, menuIds: number[], buttonAuth?: string) {
  const res = await apiClient.post('/role/menu/save', { roleId, menuIds, buttonAuth });
  return res.data;
}

// ========== 数据权限 ==========
export async function saveDataScope(userId: string, dataScope: number) {
  const res = await apiClient.post('/user/data/scope/save', { userId, dataScope });
  return res.data;
}

export async function fetchUserDataScope(userId: string) {
  const res = await apiClient.get('/user/data/get', { params: { userId } });
  return res.data;
}

// ========== 权限日志 ==========
export interface PermissionLogItem {
  logId: number;
  operator: string;
  operateTime: string;
  operateIp?: string;
  targetUser?: string;
  beforeAuth?: string;
  afterAuth?: string;
  operateType: string;
}

export interface PermissionLogResponse {
  list: PermissionLogItem[];
  total: number;
  pageNum: number;
  pageSize: number;
}

export async function fetchPermissionLogs(params: {
  pageNum?: number;
  pageSize?: number;
  operator?: string;
  targetUser?: string;
  operateType?: string;
  startTime?: string;
  endTime?: string;
}) {
  const res = await apiClient.get<PermissionLogResponse>('/log/permission/list', { params });
  return res.data;
}

export async function exportPermissionLogs(params: any) {
  const res = await apiClient.get('/log/permission/export', { params });
  return res.data;
}