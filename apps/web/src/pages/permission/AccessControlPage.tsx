import React, { useState, useMemo } from 'react';
import {
  Table, Tag, Space, Button, message, Modal, Input, Select, Typography,
} from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchUserPermissionList,
  fetchMenuTree,
  fetchUserAuthDetail,
  bindUserRoles,
  fetchRoleList,
  UserPermission,
  RoleItem,
} from '../../api/permission';

const { Text } = Typography;
const { Option } = Select;

// 页面名称映射（与侧边栏菜单一致）
const PAGE_LABELS: Record<string, string> = {
  '/': '客服运营首页',
  '/satisfaction': '用户满意度',
  '/udesc/votes': '评价分析',
  '/udesc/metrics': '会话指标',
  '/udesc/sessions': '咨询详情',
  '/demand': '需求关单率',
  '/demand/requirements': '需求详情',
  '/demand/bugs': 'Bug详情',
  '/opportunity': '机会分析',
  '/sync-udesk': 'Udesk同步',
  '/sync-zouwu': 'Zouwu同步',
  '/users': '人员管理',
  '/logs': '操作日志',
  '/access-control': '权限总览',
  '/role-manage': '角色管理',
};

// 所有页面路径（固定顺序，用于列头）
const ALL_PAGES = [
  '/', '/satisfaction',
  '/udesc/votes', '/udesc/metrics', '/udesc/sessions',
  '/demand', '/demand/requirements', '/demand/bugs',
  '/opportunity', '/sync-udesk', '/sync-zouwu',
  '/users', '/logs',
  '/access-control', '/role-manage',
];

export function AccessControlPage() {
  const [keyword, setKeyword] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserPermission | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [userAuth, setUserAuth] = useState<any>(null);
  const queryClient = useQueryClient();

  // 加载所有用户
  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ['access-control-users', keyword],
    queryFn: () => fetchUserPermissionList({ pageNum: 1, pageSize: 200, keyword }),
  });

  // 加载菜单树
  const { data: menuTree } = useQuery({
    queryKey: ['access-control-menus'],
    queryFn: fetchMenuTree,
  });

  // 加载角色列表
  const { data: roleList } = useQuery({
    queryKey: ['access-control-roles'],
    queryFn: () => fetchRoleList({ pageNum: 1, pageSize: 100 }),
  });

  // 用户已拥有的角色ID集合
  const userRoleIdsMap = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const u of userData?.list ?? []) {
      map[u.userId] = u.roles.map((r) => r.roleId);
    }
    return map;
  }, [userData]);

  // 筛选显示的用户
  const displayUsers = useMemo(() => {
    if (!userData?.list) return [];
    if (!keyword) return userData.list;
    const k = keyword.toLowerCase();
    return userData.list.filter(
      (u) =>
        u.userId.toLowerCase().includes(k) ||
        (u.name ?? '').toLowerCase().includes(k) ||
        (u.department ?? '').toLowerCase().includes(k),
    );
  }, [userData, keyword]);


  // 预览用户完整权限
  const handlePreview = async (user: UserPermission) => {
    setSelectedUser(user);
    try {
      const auth = await fetchUserAuthDetail(user.userId);
      setUserAuth(auth);
      setPreviewOpen(true);
    } catch {
      message.error('加载权限详情失败');
    }
  };

  // 快速分配角色（从预览弹窗）
  const handleAssignRoles = async (userId: string, roleIds: number[]) => {
    try {
      await bindUserRoles(userId, roleIds);
      message.success('角色分配成功');
      queryClient.invalidateQueries({ queryKey: ['access-control-users'] });
      queryClient.invalidateQueries({ queryKey: ['user-permission-list'] });
      // 刷新预览
      const auth = await fetchUserAuthDetail(userId);
      setUserAuth(auth);
    } catch (e: any) {
      message.error(e.response?.data?.message || '分配失败');
    }
  };

  // 列定义
  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      width: 100,
      fixed: 'left' as const,
      render: (v: string, record: UserPermission) => (
        <Text strong>{v || record.userId}</Text>
      ),
    },
    {
      title: '部门',
      dataIndex: 'department',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: '职位',
      dataIndex: 'position',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: '角色',
      dataIndex: 'roles',
      width: 180,
      render: (roles: UserPermission['roles']) => (
        <Space wrap size={2}>
          {roles.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 12 }}>未分配</Text>
          ) : (
            roles.map((r) => (
              <Tag key={r.roleId} color="blue" style={{ fontSize: 12 }}>{r.roleName}</Tag>
            ))
          )}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 70,
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'} style={{ fontSize: 12 }}>{v ? '正常' : '禁用'}</Tag>,
    },
    {
      title: '操作',
      width: 80,
      fixed: 'right' as const,
      render: (_: unknown, record: UserPermission) => (
        <Button size="small" type="link" onClick={() => handlePreview(record)}>
          权限详情
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          展示所有用户对各页面的访问权限，通过分配角色控制权限
        </Text>
        <Input.Search
          placeholder="搜索姓名/部门/ID"
          style={{ width: 220 }}
          onSearch={(v) => setKeyword(v)}
          allowClear
        />
      </div>

      <Table
        columns={columns}
        dataSource={displayUsers}
        rowKey="userId"
        loading={userLoading}
        pagination={{
          pageSize: 30,
          showSizeChanger: false,
          showTotal: (total) => `共 ${total} 人`,
        }}
        scroll={{ x: 1200 }}
        size="small"
      />

      {/* 权限详情弹窗 */}
      <Modal
        title={`权限详情 - ${selectedUser?.name || selectedUser?.userId}`}
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width={700}
      >
        {userAuth && (
          <div>
            {/* 基本信息 */}
            <div style={{ marginBottom: 16, background: '#f5f5f5', padding: 12, borderRadius: 6 }}>
              <Space size="large">
                <Text>部门：{selectedUser?.department || '-'}</Text>
                <Text>职位：{selectedUser?.position || '-'}</Text>
                <Tag color={selectedUser?.enabled ? 'green' : 'red'}>
                  {selectedUser?.enabled ? '账号正常' : '账号禁用'}
                </Tag>
              </Space>
            </div>

            {/* 角色分配 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text strong>绑定角色</Text>
              </div>
              <Select
                mode="multiple"
                style={{ width: '100%' }}
                placeholder="请选择角色"
                value={userRoleIdsMap[selectedUser?.userId ?? ''] ?? []}
                onChange={(roleIds) => selectedUser && handleAssignRoles(selectedUser.userId, roleIds)}
              >
                {roleList?.list?.map((r: RoleItem) => (
                  <Option key={r.roleId} value={r.roleId}>{r.roleName}</Option>
                ))}
              </Select>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                修改角色后页面权限自动更新
              </Text>
            </div>

            {/* 页面权限列表 */}
            <div>
              <Text strong style={{ marginBottom: 8, display: 'block' }}>页面访问权限</Text>
              {menuTree && menuTree.length > 0 ? (
                <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 6 }}>
                  {ALL_PAGES.map((path) => {
                    const label = PAGE_LABELS[path] || path;
                    const menuIds = userAuth.menus ?? [];
                    const hasAccess = menuIds.some(
                      (m: any) => m.menuPath === path || m.path === path || (m.path && m.path.includes(path)),
                    );
                    return (
                      <div
                        key={path}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '8px 12px',
                          borderBottom: '1px solid #f0f0f0',
                        }}
                      >
                        <Text style={{ flex: 1, fontSize: 13 }}>{label}</Text>
                        <Text code style={{ fontSize: 11, marginRight: 8 }}>{path}</Text>
                        <Tag color={hasAccess ? 'green' : 'default'} style={{ margin: 0 }}>
                          {hasAccess ? '有权限' : '无权限'}
                        </Tag>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Text type="secondary">菜单数据加载中...</Text>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}