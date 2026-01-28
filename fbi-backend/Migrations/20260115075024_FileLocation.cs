using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FbiApi.Migrations
{
    /// <inheritdoc />
    public partial class FileLocation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FileUrl",
                table: "LocationWantedPersons",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FileUrl",
                table: "LocationWantedPersons");
        }
    }
}
