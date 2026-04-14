import React, { useState } from 'react';
import { Table } from 'antd';
import type { TableProps } from 'antd';
import { Resizable } from 'react-resizable';
import type { ResizeCallbackData } from 'react-resizable';
import './ResizableTable.css';

// 可调整大小的列头组件
const ResizableTitle: React.FC<React.HTMLAttributes<any> & {
  onResize: (e: React.SyntheticEvent, data: ResizeCallbackData) => void;
  width: number;
  [key: string]: any;
}> = (props) => {
  const { onResize, width, ...restProps } = props;

  if (!width) {
    return <th {...restProps} />;
  }

  return (
    <Resizable
      width={width}
      height={0}
      handle={
        <span
          className="react-resizable-handle"
          onClick={(e) => e.stopPropagation()}
        />
      }
      onResize={onResize}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th {...restProps} />
    </Resizable>
  );
};

// 可调整列宽的表格组件
export function ResizableTable<T extends object>(props: TableProps<T>) {
  const { columns = [], ...restProps } = props;
  
  // 初始化列宽状态
  const [tableColumns, setTableColumns] = useState(() => {
    return columns.map((col) => ({
      ...col,
      width: col.width ?? 150,
    }));
  });

  // 当 columns prop 变化时更新
  React.useEffect(() => {
    setTableColumns(
      columns.map((col) => ({
        ...col,
        width: col.width ?? 150,
      }))
    );
  }, [columns]);

  // 处理列宽调整
  const handleResize = (index: number) => (
    _: React.SyntheticEvent, 
    { size }: ResizeCallbackData
  ) => {
    setTableColumns((prev) => {
      const nextColumns = [...prev];
      nextColumns[index] = {
        ...nextColumns[index],
        width: size.width,
      };
      return nextColumns;
    });
  };

  // 为每个列添加可调整大小的标题
  const resizableColumns = tableColumns.map((col, index) => ({
    ...col,
    onHeaderCell: (column: any) => ({
      width: column.width,
      onResize: handleResize(index),
    }),
  }));

  const components = {
    header: {
      cell: ResizableTitle,
    },
  };

  return (
    <Table<T>
      {...restProps}
      columns={resizableColumns}
      components={components}
      bordered
    />
  );
}
