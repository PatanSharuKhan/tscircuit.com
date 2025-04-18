import { getTestServer } from "bun-tests/fake-snippets-api/fixtures/get-test-server"
import { test, expect } from "bun:test"

test("create package", async () => {
  const { axios } = await getTestServer()

  const response = await axios.post(
    "/api/packages/create",
    {
      name: "TestPackage",
      description: "Test Description",
    },
    {
      headers: {
        Authorization: "Bearer 1234",
      },
    },
  )

  expect(response.status).toBe(200)
  expect(response.data.package.name).toBe("TestPackage")
  expect(response.data.package.description).toBe("Test Description")
  expect(response.data.package.owner_github_username).toBe("testuser")
  expect(response.data.package.description).toBe("Test Description")
  expect(response.data.package.latest_package_release_id).toBeDefined()
  expect(response.data.package.is_private).toBe(false)
  expect(response.data.package.is_public).toBe(true)
  expect(response.data.package.is_unlisted).toBe(false)
})

test("create package with private flag", async () => {
  const { axios } = await getTestServer()

  const response = await axios.post("/api/packages/create", {
    name: "TestPackage",
    description: "Test Description",
    is_private: true,
  })

  expect(response.status).toBe(200)
  expect(response.data.package.is_private).toBe(true)
})
