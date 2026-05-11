-- CreateTable
CREATE TABLE "sys_role" (
    "roleId" BIGSERIAL NOT NULL,
    "role_name" TEXT NOT NULL,
    "role_desc" TEXT,
    "status" INTEGER NOT NULL DEFAULT 1,
    "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sys_role_pkey" PRIMARY KEY ("roleId")
);

-- CreateTable
CREATE TABLE "sys_menu" (
    "id" BIGSERIAL NOT NULL,
    "parent_id" BIGINT NOT NULL DEFAULT 0,
    "menu_name" TEXT NOT NULL,
    "menu_type" INTEGER NOT NULL DEFAULT 1,
    "path" TEXT,
    "component" TEXT,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visible" INTEGER NOT NULL DEFAULT 1,
    "status" INTEGER NOT NULL DEFAULT 1,
    "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sys_menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_user_role" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" BIGINT NOT NULL,

    CONSTRAINT "sys_user_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_role_menu" (
    "id" BIGSERIAL NOT NULL,
    "role_id" BIGINT NOT NULL,
    "menu_id" BIGINT NOT NULL,
    "button_auth" TEXT,

    CONSTRAINT "sys_role_menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_user_data_scope" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "data_scope" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "sys_user_data_scope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_permission_log" (
    "log_id" BIGSERIAL NOT NULL,
    "operator" TEXT NOT NULL,
    "operate_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operate_ip" TEXT,
    "target_user" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT,

    CONSTRAINT "sys_permission_log_pkey" PRIMARY KEY ("log_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sys_user_role_user_id_role_id_key" ON "sys_user_role"("user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "sys_role_menu_role_id_menu_id_key" ON "sys_role_menu"("role_id", "menu_id");

-- CreateIndex
CREATE UNIQUE INDEX "sys_user_data_scope_user_id_key" ON "sys_user_data_scope"("user_id");

-- AddForeignKey
ALTER TABLE "sys_user_role" ADD CONSTRAINT "sys_user_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "sys_role"("roleId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_role_menu" ADD CONSTRAINT "sys_role_menu_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "sys_menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_role_menu" ADD CONSTRAINT "sys_role_menu_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "sys_role"("roleId") ON DELETE CASCADE ON UPDATE CASCADE;
