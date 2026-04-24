import React, { useState } from 'react';
import {
  Card, Table, Tag, Space, Button, message, Modal, Form, Select, Typography, Popconfirm, Input
} from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchUserPermissionList, bindUserRoles, clearUserRoles, fetchUserAuthDetail, UserPermission } from '../api/permission';

const { Text } = Typography;
const { Option } = Select;

const DATA_SCOPE_OPTIONS = [
  { value: 1, label: '个人数据', color: 'green' },
  { value: 2, label: '部门数据', color: 'orange' },
  { value: 3, label: '全域数据', color: 'red' },
];

export function UserPermissionPage() {
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [bindModalOpen, setBindModalOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserPermission | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<number[]>([]);
  const [userAuth, setUserAuth] = useState<any>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['user-permission-list', pageNum, pageSize, keyword],
    queryFn: () => fetchUserPermissionList({ pageNum, pageSize, keyword }),
  });

  const { data: roleList } = useQuery({
    queryKey: ['permission-roles-simple'],
    queryFn: async () => {
      const res = await fetch(`/api/role/list?pageNum=1&pageSize=100`);
      const json = await res.json();
      return json.list || [];
    },
  });

  const bindMutation = useMutation({
    mutationFn: ({ userId, roleIds }: { userId: string; roleIds: number[] }) => bindUserRoles(userId, roleIds),
    onSuccess: () => {
      message.success('角色绑定成功');
      setBindModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['user-permission-list'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || '绑定失败');
    },
  });

  const clearMutation = useMutation({
    mutationFn: (userId: string) => clearUserRoles(userId),
    onSuccess: () => {
      message.success('角色已清空');
      queryClient.invalidateQueries({ queryKey: ['user-permission-list'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || '清空失败');
    },
  });

  const handleBindRoles = async () => {
    if (!selectedUser) return;
    await form.validateFields();
    bindMutation.mutate({ userId: selectedUser.userId, roleIds: selectedRoles });
  };

  const handleOpenBindModal = (record: UserPermission) => {
    setSelectedUser(record);
    setSelectedRoles(record.roles.map((r) => r.roleId));
    form.setFieldsValue({ roleIds: record.roles.map((r) => r.roleId) });
    setBindModalOpen(true);
  };

  const handleClearRoles = (userId: string) => {
    clearMutation.mutate(userId);
  };

  const handlePreview = async (record: UserPermission) => {
    setSelectedUser(record);
    try {
      const auth = await fetchUserAuthDetail(record.userId);
      setUserAuth(auth);
      setPreviewModalOpen(true);
    } catch {
      message.error('加载权限详情失败');
    }
  };

  const columns = [
    {
      title: '用户ID',
      dataIndex: 'userId',
      width: 120,
    },
    {
      title: '姓名',
      dataIndex: 'name',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: '部门',
      dataIndex: 'department',
      width: 150,
      render: (v: string) => v || '-',
    },
    {
      title: '职位',
      dataIndex: 'position',
      width: 150,
      render: (v: string) => v || '-',
    },
    {
      title: '手机',
      dataIndex: 'mobile',
      width: 130,
      render: (v: string) => v || '-',
    },
    {
      title: '客服标记',
      dataIndex: 'isCustomerService',
      width: 100,
      render: (v: boolean) => <Tag color={v ? 'blue' : 'default'}>{v ? '是' : '否'}</Tag>,
    },
    {
      title: '账号状态',
      dataIndex: 'enabled',
      width: 100,
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? '正常' : '禁用'}</Tag>,
    },
    {
      title: '绑定角色',
      dataIndex: 'roles',
      width: 200,
      render: (roles: UserPermission['roles']) => (
        <Space wrap>
          {roles.length === 0 ? (
            <Text type="secondary">未分配</Text>
          ) : (
            roles.map((r) => <Tag key={r.roleId}>{r.roleName}</Tag>)
          )}
        </Space>
      ),
    },
    {
      title: '数据范围',
      dataIndex: 'dataScope',
      width: 100,
      render: (scope: number) => {
        const opt = DATA_SCOPE_OPTIONS.find((o) => o.value === scope);
        return opt ? <Tag color={opt.color}>{opt.label}</Tag> : '-';
      },
    },
    {
      title: '操作',
      width: 180,
      render: (_: unknown, record: UserPermission) => (
        <Space>
          <Button size="small" onClick={() => handleOpenBindModal(record)}>分配角色</Button>
          <Button size="small" onClick={() => handlePreview(record)}>权限预览</Button>
          <Popconfirm
            title="确认清空该用户的所有角色？"
            onConfirm={() => handleClearRoles(record.userId)}
          >
            <Button size="small" danger disabled={record.roles.length === 0}>清空</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ color: '#888', fontSize: 12 }}>
          提示：人员管理中的员工会自动同步到权限分配列表，离职账号权限自动失效
        </div>
        <Input.Search
          placeholder="搜索用户ID/姓名/部门"
          style={{ width: 300 }}
          onSearch={(value) => { setKeyword(value); setPageNum(1); }}
          allowClear
        />
      </div>

      <Table
        columns={columns}
        dataSource={data?.list}
        rowKey="userId"
        loading={isLoading}
        pagination={{
          current: pageNum,
          pageSize,
          total: data?.total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 条`,
          onChange: (p, ps) => { setPageNum(p); setPageSize(ps); },
        }}
      />

      <Modal
        title={`分配角色 - ${selectedUser?.name || selectedUser?.userId}`}
        open={bindModalOpen}
        onCancel={() => setBindModalOpen(false)}
        onOk={handleBindRoles}
        confirmLoading={bindMutation.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="roleIds" label="选择角色" rules={[{ required: true, message: '请选择至少一个角色' }]}>
            <Select
              mode="multiple"
              placeholder="请选择角色"
              value={selectedRoles}
              onChange={setSelectedRoles}
              allowClear
            >
              {roleList?.map((r: any) => (
                <Option key={r.roleId} value={r.roleId}>{r.roleName}</Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`权限预览 - ${selectedUser?.name || selectedUser?.userId}`}
        open={previewModalOpen}
        onCancel={() => setPreviewModalOpen(false)}
        footer={null}
        width={700}
      >
        {userAuth && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Text strong>绑定角色：</Text>
              <Space style={{ marginTop: 8 }}>
                {userAuth.roles?.length === 0 ? (
                  <Text type="secondary">无</Text>
                ) : (
                  userAuth.roles?.map((r: any) => <Tag key={r.roleId} color="blue">{r.roleName}</Tag>)
                )}
              </Space>
            </div>
            <div style={{ marginBottom: 16 }}>
              <Text strong>菜单权限：</Text>
              <div style={{ marginTop: 8, maxHeight: 300, overflow: 'auto' }}>
                {userAuth.menus?.length === 0 ? (
                  <Text type="secondary">无菜单权限</Text>
                ) : (
                  userAuth.menus?.map((m: any) => (
                    <Tag key={m.menuId} style={{ margin: 4 }}>{m.menuName}</Tag>
                  ))
                )}
              </div>
            </div>
            <div>
              <Text strong>数据权限：</Text>
              <Space style={{ marginTop: 8 }}>
                {(() => {
                  const opt = DATA_SCOPE_OPTIONS.find((o) => o.value === userAuth.dataScope);
                  return opt ? <Tag color={opt.color}>{opt.label}</Tag> : <Text type="secondary">个人数据</Text>;
                })()}
              </Space>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}