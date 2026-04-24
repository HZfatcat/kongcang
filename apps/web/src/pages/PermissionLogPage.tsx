import React, { useState } from 'react';
import { Card, Table, Tag, Space, Button, DatePicker, Select, Typography, Input } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { fetchPermissionLogs, exportPermissionLogs, PermissionLogItem } from '../api/permission';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Text } = Typography;
const { Option } = Select;

const OPERATE_TYPE_OPTIONS = [
  { value: 'role_create', label: '角色新增' },
  { value: 'role_edit', label: '角色编辑' },
  { value: 'role_delete', label: '角色删除' },
  { value: 'role_menu_set', label: '菜单权限配置' },
  { value: 'user_role_bind', label: '用户角色绑定' },
  { value: 'user_role_clear', label: '用户角色清空' },
  { value: 'user_data_scope', label: '数据权限修改' },
];

export function PermissionLogPage() {
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [operator, setOperator] = useState('');
  const [targetUser, setTargetUser] = useState('');
  const [operateType, setOperateType] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['permission-logs', pageNum, pageSize, operator, targetUser, operateType, dateRange],
    queryFn: () => {
      const params: any = { pageNum, pageSize };
      if (operator) params.operator = operator;
      if (targetUser) params.targetUser = targetUser;
      if (operateType) params.operateType = operateType;
      if (dateRange) {
        params.startTime = dateRange[0].format('YYYY-MM-DD');
        params.endTime = dateRange[1].format('YYYY-MM-DD');
      }
      return fetchPermissionLogs(params);
    },
  });

  const handleSearch = () => {
    setPageNum(1);
    refetch();
  };

  const handleReset = () => {
    setOperator('');
    setTargetUser('');
    setOperateType('');
    setDateRange(null);
    setPageNum(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params: any = {};
      if (operator) params.operator = operator;
      if (targetUser) params.targetUser = targetUser;
      if (operateType) params.operateType = operateType;
      if (dateRange) {
        params.startTime = dateRange[0].format('YYYY-MM-DD');
        params.endTime = dateRange[1].format('YYYY-MM-DD');
      }
      const blob = await exportPermissionLogs(params);
      // 下载文件
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `权限操作日志_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('导出失败', err);
    } finally {
      setExporting(false);
    }
  };

  const getOperateTypeTag = (type: string) => {
    const opt = OPERATE_TYPE_OPTIONS.find((o) => o.value === type);
    return opt ? <Tag color="blue">{opt.label}</Tag> : <Tag>{type}</Tag>;
  };

  const columns = [
    {
      title: '日志ID',
      dataIndex: 'logId',
      width: 80,
    },
    {
      title: '操作人',
      dataIndex: 'operator',
      width: 120,
    },
    {
      title: '操作时间',
      dataIndex: 'operateTime',
      width: 170,
      render: (time: string) => new Date(time).toLocaleString(),
    },
    {
      title: '操作IP',
      dataIndex: 'operateIp',
      width: 130,
      render: (v: string) => v || '-',
    },
    {
      title: '操作类型',
      dataIndex: 'operateType',
      width: 130,
      render: (type: string) => getOperateTypeTag(type),
    },
    {
      title: '目标用户',
      dataIndex: 'targetUser',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: '变更前',
      dataIndex: 'beforeAuth',
      width: 180,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: '变更后',
      dataIndex: 'afterAuth',
      width: 180,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
  ];

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="操作人"
            style={{ width: 140 }}
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            allowClear
          />
          <Input
            placeholder="目标用户"
            style={{ width: 140 }}
            value={targetUser}
            onChange={(e) => setTargetUser(e.target.value)}
            allowClear
          />
          <Select
            placeholder="操作类型"
            style={{ width: 150 }}
            value={operateType || undefined}
            onChange={(v) => setOperateType(v || '')}
            allowClear
          >
            {OPERATE_TYPE_OPTIONS.map((opt) => (
              <Option key={opt.value} value={opt.value}>{opt.label}</Option>
            ))}
          </Select>
          <RangePicker
            value={dateRange}
            onChange={(dates) => setDateRange(dates as any)}
          />
          <Button type="primary" onClick={handleSearch}>查询</Button>
          <Button onClick={handleReset}>重置</Button>
          <Button onClick={handleExport} loading={exporting}>导出</Button>
        </Space>
      </Card>

      <Table
        columns={columns}
        dataSource={data?.list}
        rowKey="logId"
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
    </div>
  );
}