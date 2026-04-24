import React, { useState } from 'react';
import { Card, Table, Tag, Space, Button, message, Modal, Select, Typography, message as antdMessage, Input } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchUserPermissionList, saveDataScope, fetchUserDataScope, UserPermission } from '../api/permission';

const { Text } = Typography;
const { Option } = Select;

const DATA_SCOPE_OPTIONS = [
  { value: 1, label: '个人数据（仅能看到自己创建/跟进的数据）', color: 'green' },
  { value: 2, label: '部门数据（可见本部门及下级部门数据）', color: 'orange' },
  { value: 3, label: '全域数据（可见所有数据）', color: 'red' },
];

export function DataPermissionPage() {
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserPermission | null>(null);
  const [newDataScope, setNewDataScope] = useState<number>(1);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['user-permission-list', pageNum, pageSize, keyword],
    queryFn: () => fetchUserPermissionList({ pageNum, pageSize, keyword }),
  });

  const saveMutation = useMutation({
    mutationFn: ({ userId, dataScope }: { userId: string; dataScope: number }) => saveDataScope(userId, dataScope),
    onSuccess: () => {
      antdMessage.success('数据权限保存成功');
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['user-permission-list'] });
    },
    onError: (err: any) => {
      antdMessage.error(err.response?.data?.message || '保存失败');
    },
  });

  const handleOpenModal = async (record: UserPermission) => {
    setSelectedUser(record);
    setNewDataScope(record.dataScope);
    // 如果需要从后端获取最新数据范围，可以调用 fetchUserDataScope
    try {
      const res = await fetchUserDataScope(record.userId);
      if (res && res.dataScope) {
        setNewDataScope(res.dataScope);
      }
    } catch {
      // 使用列表中的数据范围
    }
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!selectedUser) return;
    saveMutation.mutate({ userId: selectedUser.userId, dataScope: newDataScope });
  };

  const getDataScopeTag = (scope: number) => {
    const opt = DATA_SCOPE_OPTIONS.find((o) => o.value === scope);
    return opt ? <Tag color={opt.color}>{opt.label}</Tag> : <Tag>个人数据</Tag>;
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
      title: '当前数据范围',
      dataIndex: 'dataScope',
      width: 280,
      render: (scope: number) => getDataScopeTag(scope),
    },
    {
      title: '操作',
      width: 120,
      render: (_: unknown, record: UserPermission) => (
        <Button size="small" onClick={() => handleOpenModal(record)}>修改范围</Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ color: '#888', fontSize: 12 }}>
          提示：数据范围决定用户可见数据的边界，与角色权限叠加生效
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
        title={`修改数据权限 - ${selectedUser?.name || selectedUser?.userId}`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saveMutation.isPending}
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">说明：</Text>
          <ul style={{ color: '#888', fontSize: 12, marginTop: 8 }}>
            <li>个人数据：仅能看到自己创建/跟进的数据（如自己创建的客户、线索、订单）</li>
            <li>部门数据：可见本部门及下级部门所有成员的数据</li>
            <li>全域数据：可见系统中所有数据（慎用，建议仅管理员）</li>
          </ul>
        </div>
        <div>
          <Text strong>数据范围：</Text>
          <Select
            style={{ width: '100%', marginTop: 8 }}
            value={newDataScope}
            onChange={setNewDataScope}
          >
            {DATA_SCOPE_OPTIONS.map((opt) => (
              <Option key={opt.value} value={opt.value}>
                <Tag color={opt.color} style={{ marginRight: 8 }}>{opt.value}</Tag>
                {opt.label}
              </Option>
            ))}
          </Select>
        </div>
      </Modal>
    </div>
  );
}