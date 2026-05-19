#!/bin/bash

#======================================
# Kefumonitor 生产环境部署脚本
#======================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目配置
PROJECT_NAME="kefumonitor"
GIT_REPO="https://gitcode.com/GitCodeKefu/kefumonitor.git"
PROJECT_DIR="/opt/kefumonitor"

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        log_error "$1 未安装，请先安装 $1"
        exit 1
    fi
}

# 检查依赖
check_dependencies() {
    log_info "检查依赖..."
    check_command git
    check_command docker
    check_command docker
    
    # 检查 docker compose 版本
    if docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
    elif docker-compose --version &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        log_error "Docker Compose 未安装"
        exit 1
    fi
    
    log_success "依赖检查通过"
}

# 首次部署
first_deploy() {
    log_info "开始首次部署..."
    
    # 检查项目目录是否已存在
    if [ -d "$PROJECT_DIR" ]; then
        log_warn "项目目录 $PROJECT_DIR 已存在"
        read -p "是否删除并重新部署？(y/N): " confirm
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            log_info "停止并删除现有容器..."
            cd $PROJECT_DIR && $COMPOSE_CMD -f docker-compose.prod.yml down -v 2>/dev/null || true
            rm -rf $PROJECT_DIR
        else
            log_info "取消部署"
            exit 0
        fi
    fi
    
    # 克隆代码
    log_info "克隆代码仓库..."
    git clone $GIT_REPO $PROJECT_DIR
    cd $PROJECT_DIR
    
    # 配置环境变量
    log_info "配置环境变量..."
    if [ ! -f ".env" ]; then
        cp .env.example-pro .env
        log_warn "已创建 .env 文件，请根据实际情况修改配置"
        log_warn "特别注意以下配置项："
        echo "  - POSTGRES_PASSWORD: 数据库密码"
        echo "  - CORS_ORIGIN: 允许的前端域名"
        echo "  - WECOM_*: 企业微信配置"
        echo "  - ZOUWU_*: 驺吾系统配置"
        echo "  - UDESK_*: Udesk 配置"
        echo ""
        read -p "是否现在编辑配置文件？(y/N): " edit_env
        if [ "$edit_env" = "y" ] || [ "$edit_env" = "Y" ]; then
            ${EDITOR:-vi} .env
        fi
    fi
    
    # 启动服务
    log_info "构建并启动服务..."
    $COMPOSE_CMD -f docker-compose.prod.yml up -d --build
    
    # 等待服务启动
    log_info "等待服务启动..."
    sleep 10
    
    # 检查服务状态
    show_status
    
    log_success "首次部署完成！"
    show_access_info
}

# 更新部署
update_deploy() {
    log_info "开始更新部署..."
    
    if [ ! -d "$PROJECT_DIR" ]; then
        log_error "项目目录 $PROJECT_DIR 不存在，请先执行首次部署"
        exit 1
    fi
    
    cd $PROJECT_DIR
    
    # 拉取最新代码
    log_info "拉取最新代码..."
    git fetch origin
    LOCAL_HASH=$(git rev-parse HEAD)
    REMOTE_HASH=$(git rev-parse origin/main)
    
    if [ "$LOCAL_HASH" = "$REMOTE_HASH" ]; then
        log_info "代码已是最新版本"
        read -p "是否强制重新构建？(y/N): " force_build
        if [ "$force_build" != "y" ] && [ "$force_build" != "Y" ]; then
            log_info "取消更新"
            exit 0
        fi
    else
        log_info "发现新版本，正在更新..."
        git pull origin main
    fi
    
    # 重新构建并启动
    log_info "重新构建并启动服务..."
    $COMPOSE_CMD -f docker-compose.prod.yml up -d --build
    
    # 清理旧镜像
    log_info "清理未使用的镜像..."
    docker image prune -f
    
    # 检查服务状态
    sleep 5
    show_status
    
    log_success "更新部署完成！"
    show_access_info
}

# 显示服务状态
show_status() {
    log_info "服务状态："
    cd $PROJECT_DIR
    $COMPOSE_CMD -f docker-compose.prod.yml ps
}

# 显示访问信息
show_access_info() {
    echo ""
    echo "======================================"
    echo "访问地址："
    echo "  Web:  https://kefumonitor.gitcode.com"
    echo "  API:  https://kefumonitor.gitcode.com/api/v1"
    echo ""
    echo "常用命令："
    echo "  查看日志: cd $PROJECT_DIR && docker compose -f docker-compose.prod.yml logs -f"
    echo "  查看状态: cd $PROJECT_DIR && docker compose -f docker-compose.prod.yml ps"
    echo "  停止服务: cd $PROJECT_DIR && docker compose -f docker-compose.prod.yml down"
    echo "  更新部署: ./deploy.sh update"
    echo "======================================"
}

# 查看日志
show_logs() {
    cd $PROJECT_DIR
    $COMPOSE_CMD -f docker-compose.prod.yml logs -f --tail=100
}

# 停止服务
stop_services() {
    log_info "停止服务..."
    cd $PROJECT_DIR
    $COMPOSE_CMD -f docker-compose.prod.yml down
    log_success "服务已停止"
}

# 备份数据库
backup_database() {
    log_info "备份数据库..."
    BACKUP_FILE="/tmp/kefumonitor_$(date +%Y%m%d_%H%M%S).sql"
    docker exec kefu-postgres pg_dump -U kefu kefumonitor > $BACKUP_FILE
    log_success "数据库已备份到: $BACKUP_FILE"
}

# 主菜单
show_menu() {
    echo ""
    echo "======================================"
    echo "  Kefumonitor 生产环境部署脚本"
    echo "======================================"
    echo "  1) 首次部署"
    echo "  2) 更新部署"
    echo "  3) 查看状态"
    echo "  4) 查看日志"
    echo "  5) 停止服务"
    echo "  6) 备份数据库"
    echo "  0) 退出"
    echo "======================================"
}

# 主程序
main() {
    case "${1:-}" in
        install|first)
            check_dependencies
            first_deploy
            ;;
        update)
            check_dependencies
            update_deploy
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs
            ;;
        stop)
            stop_services
            ;;
        backup)
            backup_database
            ;;
        *)
            # 交互模式
            while true; do
                show_menu
                read -p "请选择操作 [0-6]: " choice
                case $choice in
                    1)
                        check_dependencies
                        first_deploy
                        ;;
                    2)
                        check_dependencies
                        update_deploy
                        ;;
                    3)
                        show_status
                        ;;
                    4)
                        show_logs
                        ;;
                    5)
                        stop_services
                        ;;
                    6)
                        backup_database
                        ;;
                    0)
                        log_info "退出"
                        exit 0
                        ;;
                    *)
                        log_error "无效选择"
                        ;;
                esac
            done
            ;;
    esac
}

# 运行主程序
main "$@"
