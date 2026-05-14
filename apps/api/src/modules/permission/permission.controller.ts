import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { PermissionService } from './permission.service';
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

@Controller()
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  // ========== 角色管理接口 ==========
  @Get('role/list')
  async getRoleList(@Query() query: RoleListQueryDto) {
    return this.permissionService.getRoleList(query);
  }

  @Post('role/add')
  async addRole(@Body() dto: AddRoleDto) {
    return this.permissionService.addRole(dto);
  }

  @Post('role/edit')
  async editRole(@Body() dto: EditRoleDto) {
    return this.permissionService.editRole(dto);
  }

  @Post('role/delete')
  async deleteRole(@Body() dto: DeleteRoleDto) {
    return this.permissionService.deleteRole(dto);
  }

  @Get('role/userList')
  async getRoleUsers(@Query('roleId') roleId: string) {
    return this.permissionService.getRoleUsers(parseInt(roleId, 10));
  }

  // ========== 用户角色分配接口 ==========
  @Get('user/permission/list')
  async getUserPermissionList(@Query() query: UserPermissionListQueryDto) {
    return this.permissionService.getUserPermissionList(query);
  }

  @Post('user/role/bind')
  async bindUserRoles(@Body() dto: BindRoleDto) {
    return this.permissionService.bindUserRoles(dto);
  }

  @Post('user/role/clear')
  async clearUserRoles(@Body() dto: ClearRoleDto) {
    return this.permissionService.clearUserRoles(dto);
  }

  @Get('user/auth/view')
  async getUserAuthDetail(@Query('userId') userId: string) {
    return this.permissionService.getUserAuthDetail(userId);
  }

  // ========== 菜单权限接口 ==========
  @Get('menu/tree')
  async getMenuTree() {
    return this.permissionService.getMenuTree();
  }

  @Post('role/menu/save')
  async saveRoleMenus(@Body() dto: SaveRoleMenuDto) {
    return this.permissionService.saveRoleMenus(dto);
  }

  @Get('role/menu/get')
  async getRoleMenus(@Query('roleId') roleId: string) {
    return this.permissionService.getRoleMenus(parseInt(roleId, 10));
  }

  // ========== 页面权限接口 ==========
  @Get('role/page-perms/get')
  async getRolePagePerms(@Query('roleId') roleId: string) {
    return this.permissionService.getRolePagePerms(parseInt(roleId, 10));
  }

  @Post('role/page-perms/save')
  async saveRolePagePerms(@Body() dto: SaveRolePagePermDto) {
    return this.permissionService.saveRolePagePerms(dto);
  }

  // ========== 数据权限接口 ==========
  @Post('user/data/scope/save')
  async saveDataScope(@Body() dto: SaveDataScopeDto) {
    return this.permissionService.saveDataScope(dto);
  }

  @Get('user/data/get')
  async getUserDataScope(@Query('userId') userId: string) {
    return this.permissionService.getUserDataScope(userId);
  }

  // ========== 权限日志接口 ==========
  @Get('log/permission/list')
  async getPermissionLogs(@Query() query: PermissionLogQueryDto) {
    return this.permissionService.getPermissionLogs(query);
  }

  @Get('log/permission/export')
  async exportPermissionLogs(@Query() query: PermissionLogQueryDto) {
    return this.permissionService.exportPermissionLogs(query);
  }
}