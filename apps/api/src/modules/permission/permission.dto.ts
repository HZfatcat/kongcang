import { IsString, IsOptional, IsArray, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

// ========== 角色管理 DTO ==========
export class RoleListQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pageNum?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  keyword?: string;
}

export class AddRoleDto {
  @IsString()
  roleName: string;

  @IsOptional()
  @IsString()
  roleDesc?: string;

  status?: number = 1;
}

export class EditRoleDto {
  @IsInt()
  roleId: number;

  @IsString()
  roleName: string;

  @IsOptional()
  @IsString()
  roleDesc?: string;

  status?: number = 1;
}

export class DeleteRoleDto {
  @IsInt()
  roleId: number;
}

// ========== 用户角色分配 DTO ==========
export class UserPermissionListQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pageNum?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  keyword?: string;
}

export class BindRoleDto {
  @IsString()
  userId: string;

  @IsArray()
  @IsInt({ each: true })
  roleIds: number[];
}

export class ClearRoleDto {
  @IsString()
  userId: string;
}

// ========== 菜单权限 DTO ==========
export class SaveRoleMenuDto {
  @IsInt()
  roleId: number;

  @IsArray()
  @IsInt({ each: true })
  menuIds: number[];

  @IsOptional()
  @IsString()
  buttonAuth?: string;
}

// ========== 数据权限 DTO ==========
export class SaveDataScopeDto {
  @IsString()
  userId: string;

  @IsInt()
  dataScope: number;
}

// ========== 权限日志 DTO ==========
export class PermissionLogQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pageNum?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  operator?: string;

  @IsOptional()
  @IsString()
  targetUser?: string;

  @IsOptional()
  @IsString()
  operateType?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;
}