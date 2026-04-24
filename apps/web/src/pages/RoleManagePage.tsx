import React, { useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Switch, message, Modal, Form, Input, Popconfirm, Typography
} from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchRoleList, addRole, editRole, deleteRole, fetchRoleUsers, RoleItem } from '../api/permission';

const { Text } = Typography;

export function RoleManagePage() {
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [usersModalOpen, setUsersModalOpen] = useState(false);
  const [selectedRoleUsers, setSelectedRoleUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['permission-roles', pageNum, pageSize, keyword],
    queryFn: () => fetchRoleList({ pageNum, pageSize, keyword }),
  });

  const handleAdd = () => {
    setEditingRole(null);
    form.resetFields();
    form.setFieldsValue({ status: 1 });
    setModalOpen(true);
  };

  const handleEdit = (record: RoleItem) => {
    setEditingRole(record);
    form.setFieldsValue({
      roleName: record.roleName,
      roleDesc: record.roleDesc,
      status: record.status,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editingRole) {
        await editRole({ ...values, roleId: editingRole.roleId });
        message.success('编辑成功');
      } else {
        await addRole(values);
        message.success('新增成功');
      }
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['permission-roles'] });
    } catch (err: any) {
      message.error(err.response?.data?.message || '操作失败');
    }
  };

  const handleDelete = async (roleId: number) => {
    try {
      await deleteRole(roleId);
      message.success('删除成功');
      queryClient.invalidateQueries({ queryKey: ['permission-roles'] });
    } catch (err: any) {
      message.error(err.response?.data?.message || '删除失败');
    }
  };

  const handleViewUsers = async (record: RoleItem) => {
    setLoadingUsers(true);
    setUsersModalOpen(true);
    try {
      const users = await fetchRoleUsers(record.roleId);
      setSelectedRoleUsers(users);
    } catch {
      message.error('加载关联用户失败');
    } finally {
      setLoadingUsers(false);
    }
  };

  const columns = [
    {
      title: '角色ID',
      dataIndex: 'roleId',
      width: 100,
    },
    {
      title: '角色名称',
      dataIndex: 'roleName',
      width: 150,
    },
    {
      title: '角色描述',
      dataIndex: 'roleDesc',
      width: 200,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: '关联账号数量',
      dataIndex: 'userCount',
      width: 120,
      render: (count: number) => <Text type="secondary">{count}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: number) => (
        <Tag color={status ? 'green' : 'red'}>{status ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      width: 180,
      render: (time: string) => new Date(time).toLocaleString(),
    },
    {
      title: '操作',
      width: 200,
      render: (_: unknown, record: RoleItem) => (
        <Space>
          <Button size="small" onClick={() => handleEdit(record)}>编辑</Button>
          <Button size="small" onClick={() => handleViewUsers(record)}>关联用户</Button>
          <Popconfirm
            title="确认删除该角色？"
            onConfirm={() => handleDelete(record.roleId)}
            description={record.userCount > 0 ? '该角色已绑定用户，无法删除' : '删除后无法恢复'}
          >
            <Button size="small" danger disabled={record.userCount > 0}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Input.Search
          placeholder="搜索角色名称/描述"
          style={{ width: 300 }}
          onSearch={(value) => { setKeyword(value); setPageNum(1); }}
          allowClear
        />
        <Button type="primary" onClick={handleAdd}>新增角色</Button>
      </div>

      <Table
        columns={columns}
        dataSource={data?.list}
        rowKey="roleId"
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
        title={editingRole ? '编辑角色' : '新增角色'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="roleName"
            label="角色名称"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input placeholder="请输入角色名称" />
          </Form.Item>
          <Form.Item name="roleDesc" label="角色描述">
            <Input.TextArea rows={3} placeholder="请输入角色描述" />
          </Form.Item>
          <Form.Item name="status" label="状态" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="关联用户列表"
        open={usersModalOpen}
        onCancel={() => setUsersModalOpen(false)}
        footer={null}
      >
        {loadingUsers ? (
          <div>加载中...</div>
        ) : selectedRoleUsers.length === 0 ? (
          <div>暂无关联用户</div>
        ) : (
          <Table
            dataSource={selectedRoleUsers}
            rowKey="userId"
            pagination={false}
            columns={[
              { title: '用户ID', dataIndex: 'userId', width: 150 },
              { title: '姓名', dataIndex: 'name', width: 120 },
              { title: '部门', dataIndex: 'department', width: 150 },
              { title: '职位', dataIndex: 'position', width: 150 },
            ]}
          />
        )}
      </Modal>
    </div>
  );
}