import React, { useState } from 'react';
import { Card, Table, Tag, Space, Button, message, Modal, Tree, Typography, Spin, Select } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchRoleList, fetchMenuTree, fetchRoleMenus, saveRoleMenus, RoleItem, MenuTreeItem } from '../api/permission';

const { Text } = Typography;
const { Option } = Select;

export function MenuPermissionPage() {
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<React.Key[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: roleList } = useQuery({
    queryKey: ['permission-roles-all'],
    queryFn: () => fetchRoleList({ pageNum: 1, pageSize: 100 }),
  });

  const { data: menuTree, isLoading: loadingMenu } = useQuery({
    queryKey: ['menu-tree'],
    queryFn: fetchMenuTree,
    enabled: !!selectedRoleId,
  });

  const { data: roleMenus, isLoading: loadingRoleMenus } = useQuery({
    queryKey: ['role-menus', selectedRoleId],
    queryFn: () => fetchRoleMenus(selectedRoleId!),
    enabled: !!selectedRoleId,
  });

  // 当角色菜单加载完成后设置勾选状态
  React.useEffect(() => {
    if (roleMenus) {
      setCheckedKeys(roleMenus);
    }
  }, [roleMenus]);

  const handleRoleChange = async (roleId: number) => {
    setSelectedRoleId(roleId);
  };

  const handleExpand = (keys: React.Key[]) => {
    setExpandedKeys(keys);
  };

  const handleCheck = (keys: React.Key[]) => {
    setCheckedKeys(keys);
  };

  const handleSave = async () => {
    if (!selectedRoleId) {
      message.warning('请先选择角色');
      return;
    }
    setSaving(true);
    try {
      await saveRoleMenus(selectedRoleId, checkedKeys as number[]);
      message.success('保存成功');
    } catch (err: any) {
      message.error(err.response?.data?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 将菜单树转换为 Tree 组件需要的格式
  const convertToTreeData = (menus: MenuTreeItem[]): any[] => {
    return menus.map((menu) => ({
      key: menu.id,
      title: (
        <Space>
          {menu.icon && <span>{menu.icon}</span>}
          <span>{menu.menuName}</span>
          <Tag color={menu.menuType === 1 ? 'blue' : menu.menuType === 2 ? 'green' : 'orange'}>
            {menu.menuType === 1 ? '菜单' : menu.menuType === 2 ? '按钮' : '接口'}
          </Tag>
        </Space>
      ),
      children: menu.children ? convertToTreeData(menu.children) : undefined,
    }));
  };

  const treeData = menuTree ? convertToTreeData(menuTree) : [];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center' }}>
        <Text>选择角色：</Text>
        <Select
          style={{ width: 200 }}
          placeholder="请选择角色"
          value={selectedRoleId}
          onChange={handleRoleChange}
          allowClear
        >
          {roleList?.list.map((r) => (
            <Option key={r.roleId} value={r.roleId}>{r.roleName}</Option>
          ))}
        </Select>
        <Button type="primary" onClick={handleSave} loading={saving} disabled={!selectedRoleId}>
          保存权限配置
        </Button>
      </div>

      <Card title="菜单权限配置">
        {!selectedRoleId ? (
          <div style={{ textAlign: 'center', color: '#999', padding: 60 }}>
            请先选择角色
          </div>
        ) : loadingMenu || loadingRoleMenus ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin /> 加载中...
          </div>
        ) : (
          <Tree
            checkable
            defaultExpandAll
            expandedKeys={expandedKeys}
            checkedKeys={checkedKeys}
            treeData={treeData}
            onExpand={handleExpand}
            onCheck={handleCheck as any}
          />
        )}
      </Card>
    </div>
  );
}